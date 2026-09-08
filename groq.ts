type GroqTextPart = { type: "text"; text: string };
type GroqImagePart = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
type GroqMessage = { role: "system" | "user" | "assistant"; content: string | Array<GroqTextPart | GroqImagePart> };

type ChatInput = {
  language: "ar" | "fr";
  mode?: "chat" | "competitions";
  messages: Array<{ role: "user" | "assistant"; content: string | Array<GroqTextPart | GroqImagePart> }>;
  competitionContext?: string;
};

let cachedModel: string | null = null;
let modelCachedAt = 0;

async function resolveGroqModel(apiKey: string) {
  if (cachedModel && Date.now() - modelCachedAt < 10 * 60 * 1000) return cachedModel;
  const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error("تعذر الوصول إلى قائمة نماذج Groq");
  const payload = await response.json() as { data?: Array<{ id: string; active?: boolean }> };
  const ids = (payload.data || []).filter((model) => model.active !== false).map((model) => model.id);
  const preferred = [
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "allam-2-7b",
    "groq/compound",
  ];
  const safeFallback = ids.find((id) => !/(guard|whisper|orpheus|safeguard|prompt)/i.test(id));
  cachedModel = preferred.find((id) => ids.includes(id)) || safeFallback || "qwen/qwen3.6-27b";
  modelCachedAt = Date.now();
  return cachedModel;
}

function removeHiddenThinking(content: string) {
  const withoutBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (withoutBlocks) return withoutBlocks;
  const finalMarker = content.match(/(?:final output|final answer|الإجابة النهائية|الجواب النهائي|réponse finale)\s*:\s*([\s\S]+)$/i);
  return finalMarker?.[1]?.trim() || content.trim();
}

function getSystemPrompt(language: "ar" | "fr", mode: "chat" | "competitions", competitionContext?: string) {
  const base = language === "ar"
    ? "أنت شينقو، المساعد الذكي داخل تطبيق ڪُولِي للمستخدمين الموريتانيين. أجب بالعربية الفصحى أو الحسانية بحسب لغة المستخدم. كن واضحًا، ودودًا، عمليًا، ولا تدّع معرفة غير مؤكدة. استخدم تنسيق Markdown عند الحاجة."
    : "Vous êtes Shinqo, l’assistant intelligent de l’application ڪُولِي pour les utilisateurs mauritaniens. Répondez en français, ou en arabe si l’utilisateur écrit en arabe. Soyez clair, chaleureux et pratique, sans inventer de faits. Utilisez Markdown lorsque cela aide.";
  if (mode !== "competitions") return base;
  const strict = language === "ar"
    ? "أنت الآن داخل قسم المسابقات والامتحانات الموريتانية. أجب فقط اعتمادًا على السجلات المرفقة أدناه. إذا لم توجد الإجابة فيها، قل بوضوح إن المعلومات غير متوفرة حاليًا، ولا تخمّن ولا تخترع موعدًا أو شرطًا."
    : "Vous êtes dans la rubrique des concours et examens mauritaniens. Répondez uniquement à partir des informations fournies ci-dessous. Si la réponse n’y figure pas, dites clairement qu’elle n’est pas disponible pour le moment. N’inventez aucune date ni condition.";
  return `${base}\n\n${strict}\n\nDonnées de référence:\n${competitionContext || "Aucune donnée de concours n’est disponible."}`;
}

export async function generateGroqReply(input: ChatInput) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const model = await resolveGroqModel(apiKey);
  const messages: GroqMessage[] = [
    { role: "system", content: getSystemPrompt(input.language, input.mode || "chat", input.competitionContext) },
    ...input.messages,
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_completion_tokens: 512,
      reasoning_format: "hidden",
      ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}),
    }),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Groq chat completion failed");
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response");
  return { content: removeHiddenThinking(content), model };
}
