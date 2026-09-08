import { describe, expect, it } from "vitest";
import { generateAssistantReply } from "../client/src/lib/assistant";

describe("Kooli assistant fallback", () => {
  it("returns an Arabic competitions-safe response", () => {
    const reply = generateAssistantReply("ما شروط المسابقة؟", "ar", "competitions");
    expect(reply).toContain("المسابقات");
    expect(reply).not.toContain("معلومة مخترعة");
  });

  it("acknowledges attachments in French", () => {
    const reply = generateAssistantReply("Analyse ce document", "fr", "chat", true);
    expect(reply).toContain("fichier");
    expect(reply).toContain("Groq");
  });
});
