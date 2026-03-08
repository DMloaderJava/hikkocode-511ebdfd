import { GeneratedFile } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

export async function generateProject(
  prompt: string,
  existingFiles: GeneratedFile[],
  onLoadingMessage: (msg: string) => void,
  onStreamDelta?: (text: string) => void,
): Promise<GeneratedFile[]> {
  const { funnyLoadingMessages } = await import("@/context/AppContext");

  let msgIndex = 0;
  const interval = setInterval(() => {
    onLoadingMessage(funnyLoadingMessages[msgIndex % funnyLoadingMessages.length]);
    msgIndex++;
  }, 2200);

  try {
    onLoadingMessage("🧠 Sending prompt to Gemini AI...");

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ prompt, existingFiles, stream: true }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle streaming response
    if (contentType.includes("text/event-stream") && response.body) {
      onLoadingMessage("✨ AI is writing code...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.text as string | undefined;
            if (content) {
              fullText += content;
              onStreamDelta?.(fullText);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      clearInterval(interval);

      // Parse the accumulated JSON
      let parsed;
      try {
        parsed = JSON.parse(fullText);
      } catch {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Failed to parse streamed AI response");
        }
      }

      const files: GeneratedFile[] = parsed?.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error("No files were generated");
      }
      return files;
    }

    // Handle non-streaming JSON response
    clearInterval(interval);
    const data = await response.json();

    if (data?.error) {
      throw new Error(data.error);
    }

    const files: GeneratedFile[] = data?.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error("No files were generated");
    }

    return files;
  } catch (err) {
    clearInterval(interval);
    throw err;
  }
}
