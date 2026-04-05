import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all files in the project with their paths, languages, and sizes. Use this first to understand the project structure.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full content of a specific file. Use this to understand existing code before making changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read, e.g. '/index.html'" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace the entire content of an existing file. Always read the file first before editing.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          content: { type: "string", description: "Complete new file content" },
          description: { type: "string", description: "Brief description of changes made" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file in the project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path for the new file, e.g. '/components/Button.js'" },
          content: { type: "string", description: "Complete file content" },
          language: { type: "string", description: "Programming language: html, css, javascript, typescript, json, etc." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" },
        },
        required: ["path"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are hikkocode AI — an expert full-stack web developer agent working inside an IDE.

## HOW YOU WORK

You have access to tools to interact with the project files. Follow this workflow:

### 1. UNDERSTAND (Thinking)
First, think about what the user wants. Explain your understanding briefly.

### 2. EXPLORE (Read)
Use \`list_files\` to see the project structure.
Use \`read_file\` to read relevant files you need to understand.
Read files that are likely affected by the changes.

### 3. PLAN (Understanding)
After reading, summarize what you found and explain your plan:
- What issues exist (if fixing bugs)
- What files need changes
- Your approach

### 4. IMPLEMENT (Edit/Create)
Use \`edit_file\` to modify existing files.
Use \`create_file\` to add new files.
Use \`delete_file\` to remove files.

## RULES
- ALWAYS read a file before editing it
- Return COMPLETE file content in edit_file (never partial)
- Write production-quality code
- Use modern best practices (ES6+, semantic HTML, CSS variables)
- Make apps fully functional, not just UI mockups
- Handle edge cases and errors properly
- Add proper accessibility attributes
- Use dark theme by default

## IMPORTANT
- You can call multiple tools in one response
- Think step by step — don't rush to edit without reading first
- Explain what you're doing between tool calls so the user can follow along`;

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, temperature, customApiKey } = await req.json();
    const requestTemp = typeof temperature === "number" ? temperature : 0.3;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Try Lovable AI Gateway first (supports tool calling)
    if (LOVABLE_API_KEY) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: apiMessages,
          stream: true,
          max_tokens: 65536,
          temperature: requestTemp,
          tools: TOOLS,
        }),
      });

      if (response.ok) {
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }

      if (response.status !== 402 && response.status !== 429) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(
          JSON.stringify({ error: `AI gateway error: ${response.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`Gateway returned ${response.status}, trying Gemini fallback...`);
    }

    // Fallback to direct Gemini API with tool calling
    const keys = customApiKey ? [customApiKey, ...getGeminiKeys()] : getGeminiKeys();
    if (keys.length === 0) {
      return new Response(
        JSON.stringify({ error: "No API keys available" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert OpenAI format tools to Gemini format
    const geminiTools = [{
      functionDeclarations: TOOLS.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];

    const systemInstruction = apiMessages.find(m => m.role === "system")?.content || "";
    const contents = apiMessages
      .filter(m => m.role !== "system")
      .map(m => {
        if (m.role === "assistant" && m.tool_calls) {
          // Convert tool calls to Gemini format
          return {
            role: "model",
            parts: [
              ...(m.content ? [{ text: m.content }] : []),
              ...m.tool_calls.map((tc: any) => ({
                functionCall: {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments),
                },
              })),
            ],
          };
        }
        if (m.role === "tool") {
          return {
            role: "user",
            parts: [{
              functionResponse: {
                name: m.name || "unknown",
                response: { result: m.content },
              },
            }],
          };
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        };
      });

    // Merge consecutive same-role messages (Gemini requirement)
    const mergedContents: any[] = [];
    for (const msg of contents) {
      if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === msg.role) {
        mergedContents[mergedContents.length - 1].parts.push(...msg.parts);
      } else {
        mergedContents.push(msg);
      }
    }

    for (const key of keys) {
      try {
        const model = "gemini-2.5-flash";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: mergedContents,
            tools: geminiTools,
            generationConfig: { temperature: requestTemp, maxOutputTokens: 65536 },
          }),
        });

        if (!res.ok) {
          console.error(`Gemini key failed (${res.status}), trying next...`);
          continue;
        }

        // Transform Gemini SSE to OpenAI format
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
                const candidate = parsed.candidates?.[0];
                if (!candidate?.content?.parts) continue;

                for (const part of candidate.content.parts) {
                  if (part.text) {
                    controller.enqueue(new TextEncoder().encode(
                      `data: ${JSON.stringify({ choices: [{ delta: { content: part.text } }] })}\n\n`
                    ));
                  }
                  if (part.functionCall) {
                    controller.enqueue(new TextEncoder().encode(
                      `data: ${JSON.stringify({
                        choices: [{
                          delta: {
                            tool_calls: [{
                              id: `call_${Date.now()}_${part.functionCall.name}`,
                              type: "function",
                              function: {
                                name: part.functionCall.name,
                                arguments: JSON.stringify(part.functionCall.args),
                              },
                            }],
                          },
                          finish_reason: "tool_calls",
                        }],
                      })}\n\n`
                    ));
                  }
                }
              } catch { /* skip partial */ }
            }
          },
          flush(controller) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          },
        });

        return new Response(res.body!.pipeThrough(transformStream), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      } catch (e) {
        console.error("Gemini key error:", e);
      }
    }

    return new Response(
      JSON.stringify({ error: "All API keys exhausted" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Agent-v2 error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
