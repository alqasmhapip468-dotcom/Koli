import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://xyukpakyarlwlagiltpa.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.VITE_ADMIN_EMAIL || "alqasmhapip468@gmail.com").toLowerCase();
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || "placeholder-key", { auth: { autoRefreshToken: false, persistSession: false } });

function firebaseAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("Firebase Admin credentials are not configured");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getAuth();
}

async function authenticatedUser(req: Request, res: Response) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) { res.status(401).json({ error: "يجب تسجيل الدخول أولًا" }); return null; }
  try { return await firebaseAuth().verifyIdToken(token); }
  catch { res.status(401).json({ error: "انتهت جلسة الدخول، سجّل الدخول مجددًا" }); return null; }
}

async function supabaseUserId(firebaseUser: { uid: string; email?: string }) {
  if (!firebaseUser.email) throw new Error("Firebase user email is required");
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const normalized = firebaseUser.email.toLowerCase();
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === normalized || user.user_metadata?.firebase_uid === firebaseUser.uid);
  if (existing) return existing.id;
  const created = await supabase.auth.admin.createUser({
    email: firebaseUser.email,
    password: `${randomUUID()}Aa9!`,
    email_confirm: true,
    user_metadata: { firebase_uid: firebaseUser.uid },
  });
  if (created.error || !created.data.user) throw created.error || new Error("Unable to create Supabase identity");
  return created.data.user.id;
}

async function ownConversation(conversationId: string, userId: string) {
  const result = await supabase.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

function fail(res: Response, error: unknown) {
  console.error("[Firebase/Supabase] request failed", error);
  res.status(500).json({ error: "تعذر الوصول إلى البيانات حاليًا" });
}

export function registerFirebaseDataRoutes(app: Express) {
  app.get("/api/data/conversations", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); const result = await supabase.from("conversations").select("id,title,created_at,updated_at").eq("user_id", id).order("updated_at", { ascending: false }); if (result.error) throw result.error; res.json(result.data || []); } catch (error) { fail(res, error); }
  });
  app.post("/api/data/conversations", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); const result = await supabase.from("conversations").insert({ user_id: id, title: String(req.body?.title || "محادثة جديدة") }).select("id,title,created_at,updated_at").single(); if (result.error) throw result.error; res.json(result.data); } catch (error) { fail(res, error); }
  });
  app.patch("/api/data/conversations/:id", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); const result = await supabase.from("conversations").update({ title: String(req.body?.title || "محادثة جديدة"), updated_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", id); if (result.error) throw result.error; res.json({ ok: true }); } catch (error) { fail(res, error); }
  });
  app.delete("/api/data/conversations/:id", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); const result = await supabase.from("conversations").delete().eq("id", req.params.id).eq("user_id", id); if (result.error) throw result.error; res.json({ ok: true }); } catch (error) { fail(res, error); }
  });
  app.get("/api/data/conversations/:id/messages", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); if (!(await ownConversation(req.params.id, id))) { res.status(404).json({ error: "المحادثة غير موجودة" }); return; } const result = await supabase.from("messages").select("id,conversation_id,role,content,attachment_name,created_at").eq("conversation_id", req.params.id).order("created_at", { ascending: true }); if (result.error) throw result.error; res.json(result.data || []); } catch (error) { fail(res, error); }
  });
  app.post("/api/data/conversations/:id/messages", async (req, res) => {
    try { const user = await authenticatedUser(req, res); if (!user) return; const id = await supabaseUserId(user); if (!(await ownConversation(req.params.id, id))) { res.status(404).json({ error: "المحادثة غير موجودة" }); return; } const result = await supabase.from("messages").insert({ conversation_id: req.params.id, role: req.body?.role, content: String(req.body?.content || ""), attachment_name: req.body?.attachmentName || null }).select("id,conversation_id,role,content,attachment_name,created_at").single(); if (result.error) throw result.error; await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", req.params.id); res.json(result.data); } catch (error) { fail(res, error); }
  });
  app.get("/api/data/competitions", async (_req, res) => { try { const result = await supabase.from("competitions").select("id,title,conditions,dates,documents,steps,last_updated").order("last_updated", { ascending: false }); if (result.error) throw result.error; res.json(result.data || []); } catch (error) { fail(res, error); } });
  app.post("/api/data/competitions", async (req, res) => { try { const user = await authenticatedUser(req, res); if (!user) return; if (user.email?.toLowerCase() !== adminEmail) { res.status(403).json({ error: "غير مصرح" }); return; } const result = await supabase.from("competitions").insert({ title: req.body.title, conditions: req.body.conditions, dates: req.body.dates, documents: req.body.documents, steps: req.body.steps, last_updated: new Date().toISOString() }); if (result.error) throw result.error; res.json({ ok: true }); } catch (error) { fail(res, error); } });
  app.patch("/api/data/competitions/:id", async (req, res) => { try { const user = await authenticatedUser(req, res); if (!user) return; if (user.email?.toLowerCase() !== adminEmail) { res.status(403).json({ error: "غير مصرح" }); return; } const result = await supabase.from("competitions").update({ title: req.body.title, conditions: req.body.conditions, dates: req.body.dates, documents: req.body.documents, steps: req.body.steps, last_updated: new Date().toISOString() }).eq("id", req.params.id); if (result.error) throw result.error; res.json({ ok: true }); } catch (error) { fail(res, error); } });
  app.delete("/api/data/competitions/:id", async (req, res) => { try { const user = await authenticatedUser(req, res); if (!user) return; if (user.email?.toLowerCase() !== adminEmail) { res.status(403).json({ error: "غير مصرح" }); return; } const result = await supabase.from("competitions").delete().eq("id", req.params.id); if (result.error) throw result.error; res.json({ ok: true }); } catch (error) { fail(res, error); } });
}
