import { describe, expect, it } from "vitest";

describe("Supabase connection configuration", () => {
  it("can reach the Supabase REST endpoint with the public key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;

    expect(url).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(key).toBeTruthy();

    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key}`,
      },
    });

    expect(response.status).toBeLessThan(500);
  }, 15000);
});
