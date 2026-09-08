import { describe, expect, it } from "vitest";
import { generateGroqReply } from "./groq";

describe("Groq chat service", () => {
  it("returns a final answer without exposing reasoning tags", async () => {
    const result = await generateGroqReply({
      language: "ar",
      mode: "chat",
      messages: [{ role: "user", content: "أجب بكلمة واحدة: مرحبًا" }],
    });

    expect(result.content).toBeTruthy();
    expect(result.content).not.toContain("<think>");
    expect(result.model).toBeTruthy();
  }, 30000);
});
