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
      description: "List all files in the project with their paths, languages, and sizes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full content of a specific file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace the entire content of an existing file. Always read the file first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          content: { type: "string", description: "Complete new file content" },
          description: { type: "string", description: "Brief description of changes" },
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
          path: { type: "string", description: "File path for the new file" },
          content: { type: "string", description: "Complete file content" },
          language: { type: "string", description: "Programming language" },
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

/**
 * OpenClaw-inspired system prompt.
 * Key differences from hikkocode agent:
 * - Skills-based approach (SKILL.md pattern)
 * - Structured reasoning with explicit phases
 * - Compaction awareness for large contexts
 * - Multi-agent routing mindset
 */
const SYSTEM_PROMPT = `You are OpenClaw Agent — an autonomous AI coding agent inspired by the OpenClaw architecture.

## CORE PHILOSOPHY
You follow the OpenClaw agent pattern: Think → Plan → Act → Verify → Reflect.
You are methodical, structured, and always explain your reasoning.

## SKILLS
You have deep expertise in:
- HTML5, CSS3, JavaScript (ES6+), TypeScript
- Modern web frameworks and patterns
- Responsive design and accessibility
- Clean architecture and SOLID principles

## WORKFLOW PHASES

### Phase 1: OBSERVE
- Use list_files to understand the project structure
- Use read_file to examine relevant files
- Build a mental model of the codebase

### Phase 2: REASON
- Explain your understanding of the request
- Identify potential issues and edge cases
- Consider multiple approaches

### Phase 3: PLAN
- Create a clear, numbered action plan
- Specify which files need changes and why
- Estimate the impact of each change

### Phase 4: EXECUTE
- Implement changes using create_file / edit_file / delete_file
- Call MULTIPLE tools in parallel when they are independent
- Write complete, production-quality code

### Phase 5: VERIFY
- Review what was changed
- Check for consistency across files
- Ensure no regressions

## CRITICAL RULES

1. **Parallel tool calls**: Always batch independent operations. If creating 3 files, call create_file 3 times in ONE response.
2. **Read before edit**: ALWAYS read a file before modifying it.
3. **Complete content**: Return FULL file content in edit_file, never partial.
4. **Quality code**: Write production-ready, well-commented code with proper error handling.
5. **Dark theme**: Use dark theme by default for UI.
6. **Accessibility**: Include proper ARIA attributes and semantic HTML.
7. **Structured output**: Use clear headers and formatting in your thinking.

## COMPACTION
When context grows large, focus on the most relevant files and summarize what you've learned rather than re-reading everything.

## RESPONSE FORMAT
Always think step by step. Use markdown headers for each phase:
### 🔍 Observing...
### 🧠 Reasoning...
### 📋 Planning...
### ⚡ Executing...
### ✅ Verifying...`;

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

    // Try Lovable AI Gateway first
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
          parallel_tool_calls: true,
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

    // Fallback to direct Gemini API
    const getGeminiKeys = (): string[] => {
      const raw = Deno.env.get("GEMINI_API_KEYS") || "";
      return raw.split(",").map((k) => k.trim()).filter(Boolean);
    };

    const keys = customApiKey ? [customApiKey, ...getGeminiKeys()] : getGeminiKeys();
    if (keys.length === 0) {
      return new Response(
        JSON.stringify({ error: "No API keys available" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert tools to Gemini format
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

    // Merge consecutive same-role messages
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
                              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${part.functionCall.name}`,
                              index: 0,
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
    console.error("Agent-openclaw error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
