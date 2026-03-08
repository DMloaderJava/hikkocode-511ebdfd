import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANNING_PROMPT = `You are hikkocode AI Agent — an expert full-stack developer that plans before coding.

Analyze the user's request and create a structured action plan. Consider:
- What files need to be created or modified
- What technologies/approaches to use
- What the implementation order should be

You MUST respond with ONLY valid JSON (no markdown, no code fences) in this format:
{
  "analysis": "Brief analysis of what needs to be done",
  "approach": "The technical approach to take",
  "steps": [
    { "action": "create_file", "file": "/index.html", "description": "Create HTML structure" },
    { "action": "add_styles", "file": "/styles.css", "description": "Add CSS styles" },
    { "action": "add_logic", "file": "/app.js", "description": "Implement JavaScript logic" }
  ],
  "technologies": ["HTML", "CSS", "JavaScript"]
}

Valid actions: create_file, edit_file, add_styles, add_logic, add_component, configure, verify
Keep the plan concise (3-8 steps). Return ONLY the JSON object.`;

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

async function getPlan(messages: Array<{ role: string; content: string }>): Promise<object | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Try gateway first
  if (LOVABLE_API_KEY) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          max_tokens: 4096,
          temperature: 0.4,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return parseJsonResponse(content);
        }
      } else if (res.status !== 402 && res.status !== 429) {
        console.error("Gateway error:", res.status);
        return null;
      }
      // Fall through to Gemini on 402/429
    } catch (e) {
      console.error("Gateway error:", e);
    }
  }

  // Gemini fallback
  const keys = getGeminiKeys();
  const systemInstruction = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: "user", parts: [{ text: m.content }] }));

  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return parseJsonResponse(text);
        }
      }
      console.error(`Gemini key failed (${res.status})`);
    } catch (e) {
      console.error("Gemini error:", e);
    }
  }

  return null;
}

function parseJsonResponse(text: string): object | null {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try extracting from code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch { /* continue */ }
  }

  // Try extracting JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* continue */ }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, existingFiles } = await req.json();

    let userContent = prompt;
    if (existingFiles && existingFiles.length > 0) {
      const fileList = existingFiles.map((f: any) => `- ${f.path} (${f.language})`).join("\n");
      userContent = `Existing project files:\n${fileList}\n\nUser request: ${prompt}`;
    }

    const messages = [
      { role: "system", content: PLANNING_PROMPT },
      { role: "user", content: userContent },
    ];

    const plan = await getPlan(messages);

    if (!plan) {
      // Return a sensible fallback plan
      return new Response(
        JSON.stringify({
          analysis: "Analyzing the request to build the application",
          approach: "Create a complete web application with HTML, CSS, and JavaScript",
          steps: [
            { action: "create_file", file: "/index.html", description: "Create HTML structure" },
            { action: "add_styles", file: "/styles.css", description: "Add CSS styles and layout" },
            { action: "add_logic", file: "/app.js", description: "Implement JavaScript functionality" },
            { action: "verify", description: "Verify the application works correctly" },
          ],
          technologies: ["HTML", "CSS", "JavaScript"],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
