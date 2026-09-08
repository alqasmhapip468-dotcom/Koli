import { firebaseAuth } from "./firebase";

export type Conversation = { id: string; title: string; created_at: string; updated_at: string };
export type ChatMessage = { id: string; conversation_id: string; role: "user" | "assistant"; content: string; attachment_name?: string | null; created_at: string };
export type Competition = { id: string; title: string; conditions: string; dates: string; documents: string; steps: string; last_updated: string };

async function request<T>(path: string, init: RequestInit = {}, requiresAuth = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (requiresAuth) {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("يجب تسجيل الدخول أولًا");
    headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  }
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "تعذر الوصول إلى البيانات");
  return body as T;
}

export function loadConversations(_userId: string) { return request<Conversation[]>("/api/data/conversations"); }
export function createConversation(_userId: string, title = "محادثة جديدة") { return request<Conversation>("/api/data/conversations", { method: "POST", body: JSON.stringify({ title }) }); }
export function renameConversation(id: string, title: string) { return request<{ ok: true }>(`/api/data/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }); }
export function removeConversation(id: string) { return request<{ ok: true }>(`/api/data/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }); }
export function loadMessages(conversationId: string) { return request<ChatMessage[]>(`/api/data/conversations/${encodeURIComponent(conversationId)}/messages`); }
export function saveMessage(conversationId: string, role: "user" | "assistant", content: string, attachmentName?: string) { return request<ChatMessage>(`/api/data/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: JSON.stringify({ role, content, attachmentName: attachmentName || null }) }); }
export function loadCompetitions() { return request<Competition[]>("/api/data/competitions", {}, false); }
export function saveCompetition(input: Omit<Competition, "id" | "last_updated"> & { id?: string }) {
  const path = input.id ? `/api/data/competitions/${encodeURIComponent(input.id)}` : "/api/data/competitions";
  return request<{ ok: true }>(path, { method: input.id ? "PATCH" : "POST", body: JSON.stringify(input) });
}
export function removeCompetition(id: string) { return request<{ ok: true }>(`/api/data/competitions/${encodeURIComponent(id)}`, { method: "DELETE" }); }
