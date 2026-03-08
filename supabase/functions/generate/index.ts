import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Laughable AI, a parody app builder. You generate complete web apps as structured JSON.

When the user describes an app, generate ALL the files needed. Return ONLY valid JSON (no markdown, no code fences) in this exact format:

{
  "files": [
    {
      "name": "index.html",
      "path": "/index.html",
      "language": "html",
      "content": "<!DOCTYPE html>..."
    },
    {
      "name": "styles.css",
      "path": "/styles.css",
      "language": "css",
      "content": "* { margin: 0; ... }"
    },
    {
      "name": "app.js",
      "path": "/app.js",
      "language": "javascript",
      "content": "console.log('hello');"
    }
  ]
}

Rules:
1. ALWAYS include index.html, styles.css, and app.js at minimum.
2. The HTML must link to styles.css and include a script tag for app.js.
3. Use modern, clean styling. Dark theme with accent colors.
4. Make the app fully functional with vanilla HTML/CSS/JS.
5. Use emoji accents in the UI for personality.
6. Include a footer saying "Built with Laughable AI 🤖".
7. If the user asks to modify existing files, return the COMPLETE updated files (not diffs).
8. The CSS link must use: <link rel="stylesheet" href="styles.css" />
9. The JS script must use: <script src="app.js"></script>
10. Make apps interactive and visually polished.
11. Return ONLY the JSON object, nothing else. No explanation, no markdown.`;

function buildMessages(prompt: string, existingFiles?: Array<{ path: string; content: string }>) {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  if (existingFiles && existingFiles.length > 0) {
    const filesContext = existingFiles
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");
    messages.push({
      role: "user",
      content: `Here are the current project files:\n\n${filesContext}\n\nNow apply this change: ${prompt}`,
    });
  } else {
    messages.push({ role: "user", content: `Build this app: ${prompt}` });
  }
  return messages;
}

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

async function callGeminiFallback(messages: Array<{ role: string; content: string }>, stream: boolean) {
  const keys = getGeminiKeys();
  if (keys.length === 0) return null;

  // Convert messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  for (const key of keys) {
    try {
      const model = "gemini-2.5-flash";
      const endpoint = stream
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
        }),
      });

      if (res.ok) return res;
      console.error(`Gemini key failed (${res.status}), trying next...`);
    } catch (e) {
      console.error("Gemini key error:", e);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, existingFiles, stream } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const messages = buildMessages(prompt, existingFiles);

    // Streaming mode
    if (stream) {
      let response: Response | null = null;
      let useGeminiFallback = false;

      if (LOVABLE_API_KEY) {
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "google/gemini-3.1-pro-preview", messages, stream: true }),
        });

        if (response.status === 402 || response.status === 429) {
          console.log(`Gateway returned ${response.status}, trying Gemini fallback...`);
          useGeminiFallback = true;
          response = null;
        } else if (!response.ok) {
          const errorText = await response.text();
          console.error("AI gateway stream error:", response.status, errorText);
          return new Response(
            JSON.stringify({ error: `AI gateway error: ${response.status}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        useGeminiFallback = true;
      }

      if (useGeminiFallback) {
        response = await callGeminiFallback(messages, true);
        if (!response) {
          return new Response(
            JSON.stringify({ error: "All API keys exhausted. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Transform Gemini SSE to our format
        const transformStream = new TransformStream({
          transform(chunk, controller) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ text: content })}\n\n`)
                  );
                }
              } catch { /* skip partial */ }
            }
          },
          flush(controller) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          },
        });

        const streamBody = response.body!.pipeThrough(transformStream);
        return new Response(streamBody, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      // Transform OpenAI-compatible SSE to our format (Lovable gateway)
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") {
              if (jsonStr === "[DONE]") {
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              }
              continue;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ text: content })}\n\n`)
                );
              }
            } catch { /* skip partial */ }
          }
        },
      });

      const streamBody = response!.body!.pipeThrough(transformStream);
      return new Response(streamBody, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // Non-streaming mode
    let response: Response | null = null;
    let useGeminiFallback = false;

    if (LOVABLE_API_KEY) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-3.1-pro-preview", messages }),
      });

      if (response.status === 402 || response.status === 429) {
        console.log(`Gateway returned ${response.status}, trying Gemini fallback...`);
        useGeminiFallback = true;
        response = null;
      } else if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(
          JSON.stringify({ error: `AI gateway error: ${response.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      useGeminiFallback = true;
    }

    if (useGeminiFallback) {
      response = await callGeminiFallback(messages, false);
      if (!response) {
        return new Response(
          JSON.stringify({ error: "All API keys exhausted. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textContent) {
        return new Response(
          JSON.stringify({ error: "No content generated" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(textContent);
      } catch {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return new Response(
            JSON.stringify({ error: "Failed to parse AI response", raw: textContent }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response!.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "No content generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(
          JSON.stringify({ error: "Failed to parse AI response", raw: textContent }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
