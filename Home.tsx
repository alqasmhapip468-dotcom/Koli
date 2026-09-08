import {
  Archive,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Languages,
  LayoutPanelLeft,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChatMessage,
  Competition,
  Conversation,
  createConversation,
  loadCompetitions,
  loadConversations,
  loadMessages,
  removeCompetition,
  removeConversation,
  renameConversation,
  saveCompetition,
  saveMessage,
} from "@/lib/data";
import { generateAssistantReply } from "@/lib/assistant";
import { extractFileText, fileToDataUrl, requestGroqReply, type AiMessage } from "@/lib/ai";
import { ADMIN_EMAIL } from "@/lib/supabase";
import { confirmPasswordReset, createUserWithEmailAndPassword, firebaseAuth, googleProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithRedirect, signOut as firebaseSignOut, updatePassword as updateFirebasePassword, verifyPasswordResetCode, type User } from "@/lib/firebase";

type Language = "ar" | "fr";
type View = "chat" | "competitions";
type AppSession = { user: User };

const copy = {
  ar: {
    brand: "ڪُولِي",
    tagline: "مساعدك الذكي",
    newChat: "محادثة جديدة",
    chats: "محادثاتك",
    competitions: "المسابقات والامتحانات",
    settings: "الإعدادات",
    signOut: "تسجيل الخروج",
    welcomeTitle: "مرحبًا بك في <brand>،",
    welcomeSubtitle: "مساعد ذكي مصمم ليفهمك. اسأل، استكشف، وأنجز أكثر — بالعربية أو بالفرنسية.",
    askAnything: "اكتب رسالتك هنا...",
    attach: "إرفاق ملف",
    send: "إرسال",
    start: "ابدأ محادثة جديدة",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    email: "البريد الإلكتروني",
    password: "كلمة السر",
    accountHint: "سجّل دخولك للوصول إلى محادثاتك المحفوظة.",
    noChats: "لا توجد محادثات بعد",
    search: "بحث",
    admin: "لوحة المسؤول",
    competitionEyebrow: "المعرفة المحلية",
    competitionTitle: "المسابقات والامتحانات الموريتانية",
    competitionSubtitle: "مرجع مبسّط للمواعيد، الشروط، والوثائق المطلوبة. المعلومات هنا تُدار مباشرة من لوحة المسؤول.",
    addCompetition: "إضافة مسابقة",
    edit: "تعديل",
    delete: "حذف",
    title: "العنوان",
    dates: "المواعيد",
    conditions: "الشروط",
    documents: "الوثائق المطلوبة",
    steps: "خطوات التسجيل",
    save: "حفظ",
    cancel: "إلغاء",
    noCompetitions: "لم تُضف مسابقات بعد.",
    adminOnly: "هذه الأدوات ظاهرة لحساب المسؤول فقط.",
    updated: "آخر تحديث",
    attachReady: "الملف جاهز للإرسال",
    rename: "إعادة تسمية",
    greeting: "أهلًا! كيف يمكنني مساعدتك اليوم؟",
    switchToFr: "Français",
    switchToAr: "العربية",
    account: "حسابك",
    member: "عضو مسجّل",
    loading: "جارٍ التحميل...",
    createAccount: "أنشئ حسابك في دقائق",
    haveAccount: "لديك حساب بالفعل؟",
    noAccount: "ليس لديك حساب؟",
    continue: "متابعة",
    authError: "تعذر إتمام العملية. تحقق من البيانات وحاول مجددًا.",
    confirmation: "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طلب Supabase ذلك.",
    forgotPassword: "نسيت كلمة السر؟",
    resetTitle: "استعادة كلمة السر",
    resetHint: "أدخل بريدك وسنرسل لك رابطًا آمنًا لإعادة تعيين كلمة السر.",
    sendReset: "إرسال الرابط",
    resetSent: "تم إرسال رابط الاستعادة. تحقق من بريدك الإلكتروني.",
    newPassword: "كلمة السر الجديدة",
    updatePassword: "تحديث كلمة السر",
    passwordUpdated: "تم تحديث كلمة السر بنجاح.",
    backToLogin: "العودة إلى تسجيل الدخول",
    googleDisabled: "تسجيل الدخول عبر Google غير مفعّل في إعدادات Supabase حاليًا.",
  },
  fr: {
    brand: "ڪُولِي",
    tagline: "Votre assistant intelligent",
    newChat: "Nouvelle conversation",
    chats: "Vos conversations",
    competitions: "Concours mauritaniens",
    settings: "Paramètres",
    signOut: "Se déconnecter",
    welcomeTitle: "Bienvenue sur <brand>,",
    welcomeSubtitle: "Un assistant intelligent qui vous comprend. Demandez, explorez et avancez — en arabe ou en français.",
    askAnything: "Écrivez votre message...",
    attach: "Joindre un fichier",
    send: "Envoyer",
    start: "Commencer une conversation",
    login: "Connexion",
    signup: "Créer un compte",
    email: "Adresse e-mail",
    password: "Mot de passe",
    accountHint: "Connectez-vous pour retrouver vos conversations enregistrées.",
    noChats: "Aucune conversation",
    search: "Rechercher",
    admin: "Administration",
    competitionEyebrow: "Ressources locales",
    competitionTitle: "Concours et examens mauritaniens",
    competitionSubtitle: "Un espace simple pour les dates, conditions et documents. Les informations sont gérées depuis l’administration.",
    addCompetition: "Ajouter un concours",
    edit: "Modifier",
    delete: "Supprimer",
    title: "Titre",
    dates: "Dates",
    conditions: "Conditions",
    documents: "Documents requis",
    steps: "Étapes d’inscription",
    save: "Enregistrer",
    cancel: "Annuler",
    noCompetitions: "Aucun concours n’a encore été ajouté.",
    adminOnly: "Ces outils sont visibles uniquement pour le compte administrateur.",
    updated: "Dernière mise à jour",
    attachReady: "Fichier prêt",
    rename: "Renommer",
    greeting: "Bonjour ! Comment puis-je vous aider aujourd’hui ?",
    switchToFr: "Français",
    switchToAr: "العربية",
    account: "Votre compte",
    member: "Membre enregistré",
    loading: "Chargement...",
    createAccount: "Créez votre compte en quelques minutes",
    haveAccount: "Vous avez déjà un compte ?",
    noAccount: "Vous n’avez pas de compte ?",
    continue: "Continuer",
    authError: "Impossible de terminer l’opération. Vérifiez vos informations.",
    confirmation: "Compte créé. Vérifiez votre e-mail si Supabase le demande.",
    forgotPassword: "Mot de passe oublié ?",
    resetTitle: "Réinitialiser le mot de passe",
    resetHint: "Saisissez votre e-mail pour recevoir un lien sécurisé de réinitialisation.",
    sendReset: "Envoyer le lien",
    resetSent: "Lien envoyé. Consultez votre boîte e-mail.",
    newPassword: "Nouveau mot de passe",
    updatePassword: "Mettre à jour le mot de passe",
    passwordUpdated: "Mot de passe mis à jour.",
    backToLogin: "Retour à la connexion",
    googleDisabled: "La connexion Google n’est pas encore activée dans les réglages Supabase.",
  },
} as const;

const fallbackCompetitions: Competition[] = [
  {
    id: "demo-bac",
    title: "مسابقة دخول السنة الأولى إعدادية",
    conditions: "التلاميذ الموريتانيون المستوفون لشروط السن والتمدرس.",
    dates: "يُعلن الموعد الرسمي عبر الجهات التعليمية.",
    documents: "شهادة الميلاد، شهادة التمدرس، وصورة شخصية.",
    steps: "متابعة الإعلان الرسمي ثم إيداع الملف لدى المركز المحدد.",
    last_updated: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "demo-teachers",
    title: "اكتتاب المعلمين والأساتذة",
    conditions: "المترشحون الحاصلون على المؤهلات المطلوبة حسب التخصص.",
    dates: "تختلف حسب كل دورة وقطاع.",
    documents: "نسخة من الشهادة، بطاقة التعريف، وشهادة السوابق عند الطلب.",
    steps: "إنشاء ملف، رفع الوثائق، ثم متابعة حالة الترشح.",
    last_updated: "2026-02-01T00:00:00.000Z",
  },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand-lockup"><div className="brand-mark">ڪ</div>{!compact && <div className="brand-name">ڪُولِي<span>.</span></div>}</div>;
}

function friendlyAuthError(error: unknown, language: Language) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  if (code === "auth/operation-not-allowed") return language === "ar" ? "تسجيل الدخول عبر Google غير مفعّل في Firebase. فعّله من Authentication ثم Sign-in method ثم Google." : "Google login is not enabled in Firebase. Enable it from Authentication > Sign-in method > Google.";
  if (code === "auth/too-many-requests") return language === "ar" ? "تم تجاوز الحد المؤقت لرسائل البريد. انتظر قليلًا قبل إعادة المحاولة أو استخدم حسابًا مؤكدًا." : "The temporary email limit was reached. Wait a little before trying again or use a confirmed account.";
  if (code === "auth/email-already-in-use") return language === "ar" ? "هذا البريد مسجّل مسبقًا. استخدم تسجيل الدخول أو استعادة كلمة السر." : "This email is already registered. Use login or reset your password.";
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return language === "ar" ? "البريد أو كلمة السر غير صحيحة." : "The email or password is incorrect.";
  return (error as { message?: string })?.message || copy[language].authError;
}

function AuthScreen({ language, onLanguageChange }: { language: Language; onLanguageChange: (value: Language) => void }) {
  const t = copy[language];
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "login") await signInWithEmailAndPassword(firebaseAuth, email, password);
      else await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (authError) { setError(friendlyAuthError(authError, language)); }
    setBusy(false);
  }

  async function sendResetLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try { await sendPasswordResetEmail(firebaseAuth, email, { url: window.location.origin, handleCodeInApp: true }); setMessage(t.resetSent); }
    catch (resetError) { setError(friendlyAuthError(resetError, language)); }
    setBusy(false);
  }

  async function googleLogin() {
    setError("");
    try { await signInWithRedirect(firebaseAuth, googleProvider); }
    catch (googleError) { setError(friendlyAuthError(googleError, language)); }
  }

  return <main className="auth-page" dir={language === "ar" ? "rtl" : "ltr"}>
    <div className="auth-card animate-enter">
      <div className="auth-header"><Brand compact /><h1>{mode === "login" ? t.login : mode === "signup" ? t.createAccount : t.resetTitle}</h1><p>{mode === "forgot" ? t.resetHint : t.accountHint}</p></div>
      {mode !== "forgot" && <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>{t.login}</button><button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>{t.signup}</button></div>}
      <form onSubmit={mode === "forgot" ? sendResetLink : submit}>
        <div className="form-field"><label>{t.email}</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" dir="ltr" /></div>
        {mode !== "forgot" && <div className="form-field"><label>{t.password}</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" /></div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? t.loading : mode === "forgot" ? t.sendReset : t.continue}</button>
      </form>
      {mode === "login" && <><button className="auth-secondary" type="button" onClick={googleLogin}><span>G</span>&nbsp; Google</button><button className="auth-link" type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>{t.forgotPassword}</button></>}
      {mode === "forgot" && <button className="auth-link" type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>{t.backToLogin}</button>}
      {message && <div className="auth-message">{message}</div>}
      {error && <div className="auth-message auth-error">{error}</div>}
      <p className="auth-note">بربطك بـ Supabase، تبقى جلسة الدخول محفوظة بأمان حتى بعد تحديث الصفحة.</p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 15 }}><LanguageToggle language={language} onChange={onLanguageChange} /></div>
    </div>
  </main>;
}

function LanguageToggle({ language, onChange }: { language: Language; onChange: (value: Language) => void }) {
  return <div className="lang-toggle"><button className={language === "ar" ? "active" : ""} onClick={() => onChange("ar")}>ع</button><button className={language === "fr" ? "active" : ""} onClick={() => onChange("fr")}>FR</button></div>;
}

function PasswordRecoveryScreen({ language }: { language: Language }) {
  const t = copy[language];
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const code = new URLSearchParams(window.location.search).get("oobCode");
      if (!code) throw new Error(t.authError);
      await verifyPasswordResetCode(firebaseAuth, code);
      await confirmPasswordReset(firebaseAuth, code, password);
      setMessage(t.passwordUpdated);
    } catch (updateError) { setError(friendlyAuthError(updateError, language)); }
    setBusy(false);
  }
  return <main className="auth-page" dir={language === "ar" ? "rtl" : "ltr"}><div className="auth-card animate-enter"><div className="auth-header"><Brand compact /><h1>{t.resetTitle}</h1><p>{t.newPassword}</p></div><form onSubmit={updatePassword}><div className="form-field"><label>{t.newPassword}</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" dir="ltr" /></div><button className="auth-submit" type="submit" disabled={busy}>{busy ? t.loading : t.updatePassword}</button></form>{message && <div className="auth-message">{message}</div>}{error && <div className="auth-message auth-error">{error}</div>}<div style={{ display: "flex", justifyContent: "center", marginTop: 15 }}><LanguageToggle language={language} onChange={() => undefined} /></div></div></main>;
}

function Sidebar({ session, language, view, conversations, activeId, open, onClose, onNewChat, onViewChange, onSelectConversation, onRename, onDelete, onSignOut }: {
  session: AppSession; language: Language; view: View; conversations: Conversation[]; activeId: string | null; open: boolean; onClose: () => void; onNewChat: () => void; onViewChange: (view: View) => void; onSelectConversation: (id: string) => void; onRename: (conversation: Conversation) => void; onDelete: (conversation: Conversation) => void; onSignOut: () => void;
}) {
  const t = copy[language];
  return <aside className={`kooli-sidebar ${open ? "open" : ""}`}>
    <div className="sidebar-brand"><Brand /><button className="sidebar-close" onClick={onClose}><X size={17} /></button></div>
    <div className="sidebar-body">
      <button className="primary-action" onClick={onNewChat}><Plus size={16} />{t.newChat}</button>
      <div className="sidebar-section-label">Workspace</div>
      <button className={`nav-item ${view === "chat" ? "active" : ""}`} onClick={() => { onViewChange("chat"); onClose(); }}><MessageCircle size={16} />{t.chats}</button>
      <button className={`nav-item ${view === "competitions" ? "active" : ""}`} onClick={() => { onViewChange("competitions"); onClose(); }}><Trophy size={16} />{t.competitions}</button>
      {view === "chat" && <>
        <div className="sidebar-section-label">{t.chats}</div>
        {conversations.length === 0 && <div style={{ padding: "10px", color: "#626a75", fontSize: 11 }}>{t.noChats}</div>}
        {conversations.map((conversation) => <div key={conversation.id} className={`conversation-item ${activeId === conversation.id ? "active" : ""}`}>
          <button style={{ background: "transparent", border: 0, color: "inherit", padding: 0, minWidth: 0, flex: 1, textAlign: "right" }} onClick={() => { onSelectConversation(conversation.id); onClose(); }}><span><MessageCircle size={14} /><span className="conversation-title">{conversation.title}</span></span></button>
          <span className="conversation-actions"><button className="mini-icon-button" title={t.rename} onClick={() => onRename(conversation)}><Pencil size={12} /></button><button className="mini-icon-button" title={t.delete} onClick={() => onDelete(conversation)}><Trash2 size={12} /></button></span>
        </div>)}
      </>}
    </div>
    <div className="sidebar-footer"><div className="account-pill"><div className="avatar"><UserRound size={15} /></div><div className="account-meta"><div className="account-email">{session.user.email}</div><div className="account-status">{session.user.email?.toLowerCase() === ADMIN_EMAIL ? t.admin : t.member}</div></div><button className="icon-button" title={t.signOut} onClick={onSignOut}><LogOut size={15} /></button></div></div>
  </aside>;
}

function EmptyChat({ language, onPrompt }: { language: Language; onPrompt: (prompt: string) => void }) {
  const t = copy[language];
  const prompts = language === "ar" ? ["لخّص لي هذا الموضوع", "ما جديد المسابقات؟", "اكتب لي خطة مذاكرة"] : ["Résume-moi ce sujet", "Quelles sont les nouveautés ?", "Crée mon plan d’étude"];
  return <div className="welcome animate-enter"><div className="welcome-orb pulse-soft"><Sparkles size={31} /></div><h1>{t.welcomeTitle.split("<brand>")[0]}<span>{t.brand}</span>{t.welcomeTitle.split("<brand>")[1]}</h1><p>{t.welcomeSubtitle}</p><div className="prompt-chips">{prompts.map((prompt) => <button className="prompt-chip" key={prompt} onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div></div>;
}

function MessageList({ messages, language }: { messages: ChatMessage[]; language: Language }) {
  return <div className="message-list">{messages.map((message) => <div className={`message-row ${message.role}`} key={message.id}><div className="message-avatar">{message.role === "assistant" ? <Sparkles size={14} /> : <UserRound size={14} />}</div><div><div className="message-bubble">{message.content}{message.attachment_name && <div className="attachment-pill"><FileText size={12} />{message.attachment_name}</div>}</div><div style={{ color: "#616873", fontSize: 10, marginTop: 4, padding: "0 3px" }}>{new Date(message.created_at).toLocaleTimeString(language === "ar" ? "ar-MR" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}</div></div></div>)}</div>;
}

function ChatView({ language, conversation, messages, onSend }: { language: Language; conversation: Conversation | null; messages: ChatMessage[]; onSend: (text: string, file?: File) => Promise<void> }) {
  const t = copy[language];
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);
  async function submit(event?: FormEvent) { event?.preventDefault(); if ((!text.trim() && !file) || busy) return; setBusy(true); await onSend(text, file); setText(""); setFile(undefined); setBusy(false); }
  return <><div className="chat-scroll" ref={scrollRef}><div className="chat-content">{messages.length === 0 ? <EmptyChat language={language} onPrompt={(prompt) => setText(prompt)} /> : <MessageList messages={messages} language={language} />}{busy && <div className="message-row assistant" style={{ marginTop: 18 }}><div className="message-avatar"><Sparkles size={14} /></div><div className="message-bubble"><span style={{ color: "#d6af55" }}>•••</span></div></div>}</div></div><div className="composer-wrap"><form className="composer" onSubmit={submit}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={t.askAnything} aria-label={t.askAnything} /><div className="composer-toolbar"><div className="composer-tools"><input ref={fileRef} className="attachment-input" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0])} /><button type="button" className="icon-button" title={t.attach} onClick={() => fileRef.current?.click()}><Paperclip size={16} /></button>{file && <span className="file-name"><Check size={12} style={{ verticalAlign: "-2px" }} /> {file.name}</span>}</div><button className="send-button" type="submit" disabled={busy || (!text.trim() && !file)} title={t.send}><ArrowUp size={18} /></button></div></form></div></>;
}

function CompetitionCard({ competition, language, isAdmin, onEdit, onDelete }: { competition: Competition; language: Language; isAdmin: boolean; onEdit: () => void; onDelete: () => void }) {
  const t = copy[language];
  return <article className="competition-card animate-enter"><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}><h3>{competition.title}</h3>{isAdmin && <div style={{ display: "flex", gap: 2 }}><button className="mini-icon-button" title={t.edit} onClick={onEdit}><Pencil size={13} /></button><button className="mini-icon-button" title={t.delete} onClick={onDelete}><Trash2 size={13} /></button></div>}</div><div className="info-row"><CalendarDays size={14} /><span><strong style={{ color: "#d5d2c9" }}>{t.dates}: </strong>{competition.dates}</span></div><div className="info-row"><ShieldCheck size={14} /><span><strong style={{ color: "#d5d2c9" }}>{t.conditions}: </strong>{competition.conditions}</span></div><div className="card-divider" /><div className="info-row"><FileText size={14} /><span><strong style={{ color: "#d5d2c9" }}>{t.documents}: </strong>{competition.documents}</span></div><div className="info-row"><Check size={14} /><span><strong style={{ color: "#d5d2c9" }}>{t.steps}: </strong>{competition.steps}</span></div><div className="card-updated">{t.updated}: {new Date(competition.last_updated).toLocaleDateString(language === "ar" ? "ar-MR" : "fr-FR")}</div></article>;
}

function CompetitionsView({ language, competitions, isAdmin, onSave, onDelete }: { language: Language; competitions: Competition[]; isAdmin: boolean; onSave: (data: Omit<Competition, "id" | "last_updated"> & { id?: string }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const t = copy[language];
  const [editing, setEditing] = useState<Competition | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", dates: "", conditions: "", documents: "", steps: "" });
  function startNew() { setEditing(null); setForm({ title: "", dates: "", conditions: "", documents: "", steps: "" }); setShowForm(true); }
  function startEdit(competition: Competition) { setEditing(competition); setForm({ title: competition.title, dates: competition.dates, conditions: competition.conditions, documents: competition.documents, steps: competition.steps }); setShowForm(true); }
  async function submit(event: FormEvent) { event.preventDefault(); await onSave({ ...form, ...(editing ? { id: editing.id } : {}) }); setShowForm(false); }
  return <div className="competitions-page" dir={language === "ar" ? "rtl" : "ltr"}><div className="page-heading"><div className="page-eyebrow">{t.competitionEyebrow}</div><h1>{t.competitionTitle}</h1><p>{t.competitionSubtitle}</p></div><div className="competition-grid">{competitions.length === 0 ? <div className="empty-state">{t.noCompetitions}</div> : competitions.map((competition) => <CompetitionCard key={competition.id} competition={competition} language={language} isAdmin={isAdmin} onEdit={() => startEdit(competition)} onDelete={() => void onDelete(competition.id)} />)}</div>{isAdmin && <div className="admin-panel"><div className="admin-panel-heading"><div><h2><Settings2 size={17} style={{ verticalAlign: "-3px", marginLeft: 7 }} /> {t.admin}</h2><p>{t.adminOnly}</p></div>{!showForm && <button className="gold-button" onClick={startNew}><Plus size={14} style={{ verticalAlign: "-2px", marginLeft: 4 }} />{t.addCompetition}</button>}</div>{showForm && <form onSubmit={submit}><div className="admin-form-grid"><div className="form-field full"><label>{t.title}</label><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div><div className="form-field"><label>{t.dates}</label><textarea value={form.dates} onChange={(event) => setForm({ ...form, dates: event.target.value })} required /></div><div className="form-field"><label>{t.conditions}</label><textarea value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} required /></div><div className="form-field"><label>{t.documents}</label><textarea value={form.documents} onChange={(event) => setForm({ ...form, documents: event.target.value })} required /></div><div className="form-field"><label>{t.steps}</label><textarea value={form.steps} onChange={(event) => setForm({ ...form, steps: event.target.value })} required /></div></div><div className="admin-actions"><button className="gold-button" type="submit">{t.save}</button><button className="ghost-button" type="button" onClick={() => setShowForm(false)}>{t.cancel}</button></div></form>}</div>}</div>;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("kooli-language") as Language) || "ar");
  const [session, setSession] = useState<AppSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(() => new URLSearchParams(window.location.search).get("mode") === "resetPassword");
  const [view, setView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>(fallbackCompetitions);

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId]);
  const t = copy[language];
  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL;

  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; localStorage.setItem("kooli-language", language); }, [language]);
  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => { if (mounted) { setSession(user ? { user } : null); setAuthLoading(false); } });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  useEffect(() => { if (!session) return; loadConversations(session.user.uid).then(setConversations).catch(() => setConversations([])); loadCompetitions().then((data) => { if (data.length) setCompetitions(data); }).catch(() => undefined); }, [session]);
  useEffect(() => { if (!activeId) { setMessages([]); return; } loadMessages(activeId).then(setMessages).catch(() => setMessages([])); }, [activeId]);

  function changeLanguage(next: Language) { setLanguage(next); }
  async function newChat() { if (!session) return; try { const conversation = await createConversation(session.user.uid, t.newChat); setConversations((items) => [conversation, ...items]); setActiveId(conversation.id); setMessages([]); setView("chat"); } catch { toast.error(language === "ar" ? "تعذر حفظ المحادثة. تحقق من إعداد Firebase وSupabase." : "Impossible d’enregistrer la conversation. Vérifiez Firebase et Supabase."); } }
  async function selectConversation(id: string) { setActiveId(id); setView("chat"); }
  async function sendMessage(text: string, file?: File) {
    if (!session) return;
    let conversation = activeConversation;
    if (!conversation) { try { conversation = await createConversation(session.user.uid, text.trim().slice(0, 40) || file?.name || t.newChat); setConversations((items) => [conversation!, ...items]); setActiveId(conversation.id); } catch { toast.error(language === "ar" ? "تعذر إنشاء المحادثة. تحقق من إعداد Firebase وSupabase." : "Impossible de créer la conversation. Vérifiez Firebase et Supabase."); return; } }
    const userContent = text.trim() || (file ? `${t.attach}: ${file.name}` : "");
    const localUser: ChatMessage = { id: `local-${Date.now()}`, conversation_id: conversation.id, role: "user", content: userContent, attachment_name: file?.name, created_at: new Date().toISOString() };
    setMessages((items) => [...items, localUser]);
    try { const saved = await saveMessage(conversation.id, "user", userContent, file?.name); setMessages((items) => items.map((item) => item.id === localUser.id ? saved : item)); } catch { /* local mode keeps the exchange usable */ }
    const priorMessages: AiMessage[] = [...messages, localUser].map((item) => ({ role: item.role, content: item.content }));
    if (file?.type.startsWith("image/") && file.size <= 4_000_000) {
      try {
        const imageData = await fileToDataUrl(file);
        const latest = priorMessages[priorMessages.length - 1];
        if (latest?.role === "user") latest.content = [{ type: "text", text: userContent || "حلّل هذه الصورة" }, { type: "image_url", image_url: { url: imageData, detail: "auto" } }];
      } catch { /* fallback to text-only request */ }
    } else if (file?.type.startsWith("text/") || file?.name.toLowerCase().endsWith(".txt")) {
      try {
        const extractedText = await file.text();
        const latest = priorMessages[priorMessages.length - 1];
        if (latest?.role === "user") latest.content = `${userContent}\n\nمحتوى الملف المرفق:\n${extractedText.slice(0, 12000)}`;
      } catch { /* fallback to file name */ }
    } else if (file && (file.type === "application/pdf" || /\.docx?$/i.test(file.name))) {
      try {
        const extractedText = await extractFileText(file);
        const latest = priorMessages[priorMessages.length - 1];
        if (latest?.role === "user") latest.content = `${userContent}\n\nمحتوى الملف المرفق:\n${extractedText}`;
      } catch { /* fallback to file name */ }
    }
    let reply: string;
    try {
      const competitionContext = view === "competitions" ? competitions.map((item) => `${item.title}\nالشروط: ${item.conditions}\nالمواعيد: ${item.dates}\nالوثائق: ${item.documents}\nالخطوات: ${item.steps}`).join("\n\n") : undefined;
      reply = await requestGroqReply({ language, mode: view === "competitions" ? "competitions" : "chat", messages: priorMessages, competitionContext });
    } catch {
      reply = generateAssistantReply(userContent, language, view === "competitions" ? "competitions" : "chat", !!file);
    }
    const localAssistant: ChatMessage = { id: `local-a-${Date.now()}`, conversation_id: conversation.id, role: "assistant", content: reply, created_at: new Date().toISOString() };
    setMessages((items) => [...items, localAssistant]);
    try { const savedAssistant = await saveMessage(conversation.id, "assistant", reply); setMessages((items) => items.map((item) => item.id === localAssistant.id ? savedAssistant : item)); } catch { /* local mode */ }
  }
  async function rename(item: Conversation) { const title = window.prompt(t.rename, item.title); if (!title?.trim()) return; try { await renameConversation(item.id, title.trim()); setConversations((items) => items.map((conversation) => conversation.id === item.id ? { ...conversation, title: title.trim() } : conversation)); } catch { toast.error(language === "ar" ? "تعذر إعادة التسمية." : "Impossible de renommer."); } }
  async function deleteChat(item: Conversation) { if (!window.confirm(language === "ar" ? "هل تريد حذف هذه المحادثة؟" : "Supprimer cette conversation ?")) return; try { await removeConversation(item.id); setConversations((items) => items.filter((conversation) => conversation.id !== item.id)); if (activeId === item.id) { setActiveId(null); setMessages([]); } } catch { toast.error(language === "ar" ? "تعذر الحذف." : "Impossible de supprimer."); } }
  async function saveCompetitionHandler(input: Omit<Competition, "id" | "last_updated"> & { id?: string }) { try { await saveCompetition(input); const next = await loadCompetitions(); setCompetitions(next); toast.success(language === "ar" ? "تم حفظ المسابقة." : "Concours enregistré."); } catch { toast.error(language === "ar" ? "تعذر الحفظ. شغّل schema.sql وتأكد من حساب المسؤول." : "Impossible d’enregistrer. Vérifiez schema.sql et le compte administrateur."); } }
  async function deleteCompetitionHandler(id: string) { if (!window.confirm(language === "ar" ? "حذف هذه المسابقة؟" : "Supprimer ce concours ?")) return; try { await removeCompetition(id); setCompetitions((items) => items.filter((item) => item.id !== id)); } catch { toast.error(language === "ar" ? "تعذر الحذف." : "Impossible de supprimer."); } }
  async function signOut() { await firebaseSignOut(firebaseAuth); }

  if (authLoading) return <div className="auth-page"><div className="welcome"><div className="welcome-orb pulse-soft"><Sparkles size={28} /></div><p>{t.loading}</p></div></div>;
  if (recoveryMode) return <PasswordRecoveryScreen language={language} />;
  if (!session) return <AuthScreen language={language} onLanguageChange={changeLanguage} />;

  return <div className="kooli-shell" dir={language === "ar" ? "rtl" : "ltr"}>
    <Sidebar session={session} language={language} view={view} conversations={conversations} activeId={activeId} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNewChat={() => { void newChat(); setSidebarOpen(false); }} onViewChange={setView} onSelectConversation={(id) => { void selectConversation(id); }} onRename={(item) => { void rename(item); }} onDelete={(item) => { void deleteChat(item); }} onSignOut={() => { void signOut(); }} />
    <main className="kooli-main">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button><div className="topbar-title"><strong>{view === "chat" ? (activeConversation?.title || t.start) : t.competitionTitle}</strong><small>{view === "chat" ? t.tagline : t.competitionEyebrow}</small></div><div className="topbar-actions"><LanguageToggle language={language} onChange={changeLanguage} /><button className="icon-button" title={t.settings}><MoreHorizontal size={18} /></button></div></header>
      {view === "chat" ? <ChatView language={language} conversation={activeConversation} messages={messages} onSend={sendMessage} /> : <CompetitionsView language={language} competitions={competitions} isAdmin={!!isAdmin} onSave={saveCompetitionHandler} onDelete={deleteCompetitionHandler} />}
    </main>
  </div>;
}
