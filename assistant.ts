export function generateAssistantReply(
  text: string,
  language: "ar" | "fr",
  context: "chat" | "competitions",
  hasAttachment = false,
) {
  const clean = text.trim();
  if (language === "fr") {
    if (context === "competitions") {
      return "Je peux vous aider à comprendre les concours mauritaniens. Pour une réponse exacte, consultez les informations publiées dans cette rubrique et précisez le concours ou la date recherchée.";
    }
    if (hasAttachment) {
      return "J’ai bien reçu votre fichier. L’analyse avancée des pièces jointes sera activée dès que la clé Groq sera ajoutée côté serveur. En attendant, vous pouvez copier le texte important dans votre message.";
    }
    return `Merci pour votre message : « ${clean.slice(0, 120)}${clean.length > 120 ? "…" : ""} ». Je suis l’assistant de ڪُولِي. La génération avancée sera activée avec Groq, et je pourrai ensuite répondre avec tout le contexte de cette conversation.`;
  }

  if (context === "competitions") {
    return "أستطيع مساعدتك في فهم المسابقات والامتحانات الموريتانية. للحصول على إجابة دقيقة، اذكر اسم المسابقة أو الموعد الذي تبحث عنه، وسأعتمد على المعلومات المنشورة في هذا القسم فقط.";
  }
  if (hasAttachment) {
    return "تم استلام الملف بنجاح. سيُفعّل تحليل الصور والملفات المتقدم فور إضافة مفتاح Groq في إعدادات الخادم. يمكنك أيضًا نسخ النص المهم هنا مؤقتًا.";
  }
  return `شكرًا لرسالتك: « ${clean.slice(0, 120)}${clean.length > 120 ? "…" : ""} ». أنا مساعدك في ڪُولِي. ستعمل الإجابات الذكية الكاملة عبر Groq بعد إضافة المفتاح السري، مع الاحتفاظ بسياق هذه المحادثة.`;
}
