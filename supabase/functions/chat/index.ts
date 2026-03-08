import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Laughable AI, a friendly and helpful AI assistant inside an app builder IDE. You help users build web apps.

When a user asks you to BUILD or MODIFY an app, respond conversationally explaining what you'll do, then include a JSON code block with the generated files in this exact format:

\`\`\`json
{
  "files": [
    {
      "name": "index.html",
      "path": "/index.html", 
      "language": "html",
      "content": "<!DOCTYPE html>..."
    }
  ]
}
\`\`\`

Rules for code generation:
1. ALWAYS include index.html, styles.css, and app.js at minimum.
2. HTML must link to styles.css and include script tag for app.js.
3. Use modern, clean styling with dark theme and accent colors.
4. Make apps fully functional with vanilla HTML/CSS/JS.
5. If modifying existing files, return COMPLETE updated files.
6. Make apps interactive and visually polished.

When a user asks a QUESTION (not building), just answer conversationally without generating files.
Be concise, friendly, and use markdown formatting.`;

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

async function callGeminiFallbackStream(messages: Array<{ role: string; content: string }>) {
  const keys = getGeminiKeys();
  if (keys.length === 0) return null;

  const systemInstruction = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  for (const key of keys) {
    try {
      const model = "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

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
    const { messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

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
          messages: apiMessages,
          stream: true,
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
      response = await callGeminiFallbackStream(apiMessages);
      if (!response) {
        return new Response(
          JSON.stringify({ error: "All API keys exhausted. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Transform Gemini SSE to OpenAI-compatible SSE format
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
                // Emit in OpenAI-compatible format
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({
                    choices: [{ delta: { content } }]
                  })}\n\n`)
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
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Pass through the SSE stream directly (Lovable gateway)
    return new Response(response!.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
