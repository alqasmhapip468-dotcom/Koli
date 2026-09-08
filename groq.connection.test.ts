import { describe, expect, it } from "vitest";

describe("Groq connection configuration", () => {
  it("can access the Groq models endpoint with the configured API key", async () => {
    const key = process.env.GROQ_API_KEY;
    expect(key).toBeTruthy();

    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(200);
  }, 15000);
});
