import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANNING_PROMPT = `You are hikkocode AI Agent — an expert full-stack developer that analyzes tasks and creates structured plans.

Analyze the user's request and their existing project files. Create a detailed action plan.

You MUST respond with ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "analysis": "Brief analysis of what needs to be done",
  "approach": "The technical approach to take",
  "files_to_read": ["path/to/file1.js"],
  "files_to_edit": ["path/to/file2.js"],
  "new_files": ["path/to/new_file.js"],
  "plan": [
    "Step 1: Description of what to do",
    "Step 2: Description of what to do"
  ],
  "technologies": ["HTML", "CSS", "JavaScript"]
}

Rules:
- files_to_read: existing files the agent needs to understand before making changes
- files_to_edit: existing files that will be modified
- new_files: files that need to be created from scratch
- plan: ordered list of human-readable steps (3-8 steps)
- technologies: libraries/tools to use
- If no existing files, files_to_read and files_to_edit should be empty arrays
- For new projects, new_files should include at minimum: index.html, styles.css, app.js
- Keep analysis and approach concise (1-2 sentences each)

Return ONLY the JSON object, nothing else.`;

function getGeminiKeys(): string[] {
  const raw = Deno.env.get("GEMINI_API_KEYS") || "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

function parseJsonResponse(text: string): object | null {
  try { return JSON.parse(text); } catch { /* continue */ }
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch { /* continue */ }
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch { /* continue */ }
  }
  return null;
}

async function getPlan(messages: Array<{ role: string; content: string }>): Promise<object | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return parseJsonResponse(content);
      } else if (res.status !== 402 && res.status !== 429) {
        console.error("Gateway error:", res.status);
        return null;
      }
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
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return parseJsonResponse(text);
      }
      console.error(`Gemini key failed (${res.status})`);
    } catch (e) {
      console.error("Gemini error:", e);
    }
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
      const isNewProject = !existingFiles || existingFiles.length === 0;
      return new Response(
        JSON.stringify({
          analysis: "Analyzing the request to build the application",
          approach: "Create a complete web application with HTML, CSS, and JavaScript",
          files_to_read: isNewProject ? [] : existingFiles.map((f: any) => f.path),
          files_to_edit: isNewProject ? [] : existingFiles.map((f: any) => f.path),
          new_files: isNewProject ? ["/index.html", "/styles.css", "/app.js"] : [],
          plan: [
            "Analyze the requirements",
            "Create HTML structure with semantic elements",
            "Add CSS styles with responsive design",
            "Implement JavaScript functionality",
            "Verify everything works correctly",
          ],
          technologies: ["HTML", "CSS", "JavaScript"],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure required fields exist
    const safePlan = {
      analysis: (plan as any).analysis || "Analyzing request",
      approach: (plan as any).approach || "Building the application",
      files_to_read: (plan as any).files_to_read || [],
      files_to_edit: (plan as any).files_to_edit || [],
      new_files: (plan as any).new_files || [],
      plan: (plan as any).plan || [],
      technologies: (plan as any).technologies || [],
    };

    return new Response(JSON.stringify(safePlan), {
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
