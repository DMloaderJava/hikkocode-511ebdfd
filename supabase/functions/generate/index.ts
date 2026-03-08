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
3. Use modern, dark-themed styling with a neon green (#00ff88) accent color.
4. Make the app fully functional with vanilla HTML/CSS/JS.
5. Use emoji accents in the UI for personality.
6. Include a footer saying "Built with Laughable AI 🤖".
7. If the user asks to modify existing files, return the COMPLETE updated files (not diffs).
8. The CSS link must use: <link rel="stylesheet" href="styles.css" />
9. The JS script must use: <script src="app.js"></script>
10. Make apps interactive and visually polished.
11. Return ONLY the JSON object, nothing else. No explanation, no markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, existingFiles, stream } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood. I will generate complete web apps as structured JSON with the exact format specified." }] },
    ];

    if (existingFiles && existingFiles.length > 0) {
      const filesContext = existingFiles
        .map((f: { path: string; content: string }) => `--- ${f.path} ---\n${f.content}`)
        .join("\n\n");
      messages.push({
        role: "user",
        parts: [{ text: `Here are the current project files:\n\n${filesContext}\n\nNow apply this change: ${prompt}` }],
      });
    } else {
      messages.push({
        role: "user",
        parts: [{ text: `Build this app: ${prompt}` }],
      });
    }

    // Streaming mode
    if (stream) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini stream error:", response.status, errorText);
        return new Response(
          JSON.stringify({ error: `Gemini API error: ${response.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Transform Gemini SSE to our SSE format
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          const lines = text.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
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

    // Non-streaming mode (fallback)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
  } catch (e) {
    console.error("Generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
