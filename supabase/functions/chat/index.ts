import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are hikkocode AI — an expert full-stack web developer assistant inside an IDE. You write production-quality code.

## WHEN THE USER ASKS TO BUILD OR MODIFY AN APP:

1. Briefly explain your approach (2-3 sentences max).
2. Then output a JSON code block with ALL project files:

\`\`\`json
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
\`\`\`

## CODE QUALITY RULES:

### Structure
- ALWAYS include: index.html, styles.css, app.js (minimum 3 files).
- HTML must use: <link rel="stylesheet" href="styles.css"> and <script src="app.js"></script>
- When modifying existing code, return COMPLETE files (never partial/diffs).
- Split complex apps: add extra JS files (e.g., utils.js, api.js) when logic exceeds 200 lines.
- For complex projects you may also include: package.json, tsconfig.json, .env, config files.
- Supported language values: "html", "css", "javascript", "typescript", "json", "markdown", "yaml", "toml", "text", "xml", "bash"
- Use "typescript" for .ts, .tsx files. Use "javascript" for .js, .jsx files.

### HTML Best Practices
- Use semantic HTML5: <header>, <main>, <nav>, <section>, <article>, <footer>.
- Include proper <meta> tags (charset, viewport).
- Use meaningful class names (BEM-style or descriptive).
- Accessibility: aria-labels, alt text, proper headings hierarchy, focus states.
- Include a favicon link.

### CSS Best Practices
- Use CSS custom properties (variables) for colors, spacing, fonts.
- Mobile-first responsive design with media queries.
- Modern layout: CSS Grid and Flexbox.
- Smooth transitions and animations where appropriate.
- Dark theme by default with thoughtful color palette.
- Use clamp() for fluid typography.
- Box-sizing: border-box globally.
- Proper focus-visible outlines for accessibility.

### JavaScript Best Practices
- Modern ES6+: const/let, arrow functions, template literals, destructuring.
- Event delegation where possible.
- Proper error handling with try/catch.
- DOMContentLoaded wrapper.
- Clean separation of concerns: data, rendering, event handling.
- Use fetch() for API calls with proper error handling.
- Add loading states and user feedback for async operations.
- Use localStorage for persistence when appropriate.
- Debounce input handlers, throttle scroll handlers.
- No inline onclick — use addEventListener.

### Visual Design
- Professional, polished UI — not a toy/demo.
- Consistent spacing scale (4px/8px/16px/24px/32px/48px).
- Typography hierarchy with proper font sizes and weights.
- Subtle shadows, rounded corners, micro-interactions.
- Empty states, loading states, error states.
- Hover effects, active states, disabled states on interactive elements.
- Toast notifications for user feedback.
- Smooth page transitions and element animations.

### App Functionality
- Apps MUST be fully functional, not just UI mockups.
- Implement full CRUD where applicable.
- Form validation with clear error messages.
- Keyboard navigation support.
- Search and filter functionality where relevant.
- Data persistence using localStorage.
- Proper state management.

## WHEN THE USER ASKS A QUESTION (not about building):
Answer conversationally using markdown. Be concise and helpful. Do NOT generate files.

## IMPORTANT:
- Write the BEST code you can — treat every app like a production deployment.
- Think through edge cases and error handling.
- Make apps you would be proud to show in a portfolio.`;

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
      response = await callGeminiFallbackStream(apiMessages);
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
