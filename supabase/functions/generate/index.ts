import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are hikkocode AI — an expert full-stack web developer. You generate complete, production-quality web applications.

OUTPUT FORMAT: Return ONLY valid JSON (no markdown, no code fences, no explanation) in this exact format:

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
      "content": "..."
    },
    {
      "name": "app.js",
      "path": "/app.js",
      "language": "javascript",
      "content": "..."
    }
  ]
}

## MANDATORY RULES:

### Files
- ALWAYS include at minimum: index.html, styles.css, app.js.
- HTML must use: <link rel="stylesheet" href="styles.css"> and <script src="app.js"></script>
- For complex apps, add additional JS modules (utils.js, api.js, components.js).
- When modifying existing files, return COMPLETE updated files.

### HTML
- Semantic HTML5: <header>, <main>, <nav>, <section>, <article>, <footer>.
- Proper <meta charset="UTF-8">, <meta name="viewport">.
- Meaningful class names. Accessibility: aria-labels, alt text, focus states.

### CSS
- CSS custom properties for theming (--color-primary, --spacing-md, etc.).
- Mobile-first responsive design with breakpoints.
- CSS Grid + Flexbox for layouts.
- Dark theme by default with professional color palette.
- Smooth transitions, subtle animations.
- Consistent spacing (4/8/16/24/32/48px scale).
- box-sizing: border-box globally.

### JavaScript
- Modern ES6+: const/let, arrow functions, template literals, async/await.
- DOMContentLoaded wrapper.
- addEventListener (no inline handlers).
- Proper error handling with try/catch.
- Loading states, empty states, error states.
- localStorage for data persistence.
- Form validation with user feedback.
- Debounce/throttle where needed.

### Design Quality
- Professional, polished UI — production-grade.
- Typography hierarchy, consistent spacing.
- Interactive feedback: hover, active, focus, disabled states.
- Toast/notification system for user actions.
- Smooth animations and micro-interactions.
- Empty states with helpful messages.

### Functionality
- Apps MUST be fully functional, not mockups.
- Full CRUD where applicable.
- Search, filter, sort where relevant.
- Keyboard navigation support.
- Proper state management.

Return ONLY the JSON object. No extra text.`;

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
      content: `Current project files:\n\n${filesContext}\n\nApply this change: ${prompt}\n\nReturn the complete updated files as JSON.`,
    });
  } else {
    messages.push({ role: "user", content: `Build this app: ${prompt}\n\nReturn all files as JSON.` });
  }
  return messages;
}

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

async function callGeminiFallback(messages: Array<{ role: string; content: string }>, stream: boolean, customKey?: string) {
  const keys = customKey ? [customKey, ...getGeminiKeys()] : getGeminiKeys();
  if (keys.length === 0) return null;

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
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 65536,
          },
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
    const { prompt, existingFiles, stream, customApiKey } = await req.json();
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
          body: JSON.stringify({
            model: "google/gemini-3.1-pro-preview",
            messages,
            stream: true,
            max_tokens: 65536,
            temperature: 0.7,
          }),
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
        response = await callGeminiFallback(messages, true, customApiKey || undefined);
        if (!response) {
          return new Response(
            JSON.stringify({ error: "All API keys exhausted. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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
        body: JSON.stringify({
          model: "google/gemini-3.1-pro-preview",
          messages,
          max_tokens: 65536,
          temperature: 0.7,
        }),
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
      response = await callGeminiFallback(messages, false, customApiKey || undefined);
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
