type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type AiMessage = { role: "user" | "assistant"; content: string | Array<TextPart | ImagePart> };

export async function requestGroqReply(input: {
  language: "ar" | "fr";
  mode: "chat" | "competitions";
  messages: AiMessage[];
  competitionContext?: string;
}) {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as { content?: string; error?: string };
  if (!response.ok || !payload.content) throw new Error(payload.error || "تعذر الحصول على رد الذكاء الاصطناعي");
  return payload.content;
}

export async function extractFileText(file: File) {
  const dataUrl = await fileToDataUrl(file);
  const [, base64 = ""] = dataUrl.split(",");
  const response = await fetch("/api/files/extract-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64 }),
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
  if (!response.ok || !payload.text) throw new Error(payload.error || "تعذر استخراج نص الملف");
  return payload.text;
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
