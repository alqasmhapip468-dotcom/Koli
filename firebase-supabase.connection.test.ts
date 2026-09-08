import { describe, expect, it } from "vitest";

describe("Firebase + Supabase server credentials", () => {
  it("accepts Firebase Admin JSON and can query Supabase with service role", async () => {
    const firebaseJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(firebaseJson, "FIREBASE_SERVICE_ACCOUNT_JSON is required").toBeTruthy();
    expect(supabaseKey, "SUPABASE_SERVICE_ROLE_KEY is required").toBeTruthy();
    const serviceAccount = JSON.parse(firebaseJson!);
    expect(serviceAccount.project_id).toBe("souq-7b80f");
    expect(serviceAccount.client_email).toContain("iam.gserviceaccount.com");

    const response = await fetch("https://xyukpakyarlwlagiltpa.supabase.co/rest/v1/competitions?select=id&limit=1", {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    });
    expect(response.ok, await response.text()).toBe(true);
  }, 30_000);
});
