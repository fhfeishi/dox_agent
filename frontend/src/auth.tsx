import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Roles choose the interface (query 2026-1013 1133): leader = lean leader view, admin = full + accounts, user = full. */
export type Role = "admin" | "leader" | "user";
type Session = { configured: boolean; authenticated: boolean; username: string; role: Role | ""; guides_seen: string[] };
type Auth = { logout: () => Promise<void>; username: string; role: Role; guidesSeen: string[]; seeGuide: (key: string) => void };
const AuthContext = createContext<Auth>({ logout: async () => {}, username: "", role: "user", guidesSeen: [], seeGuide: () => {} });
export const useAuth = () => useContext(AuthContext);
export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", leader: "领导", user: "普通用户" };

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) throw new Error("无法连接登录服务");
      setSession(await response.json()); setError("");
    } catch (cause) { setError((cause as Error).message); }
  }
  useEffect(() => {
    void load();
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60000);
    return () => { window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, []);
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok || response.status === 401) {
      setSession((old) => old ? { ...old, authenticated: false } : null);
      window.location.assign("/");
    }
  }
  function seeGuide(key: string) {
    setSession((old) => old ? { ...old, guides_seen: [...new Set([...old.guides_seen, key])] } : old);
    void fetch("/api/auth/guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
  }
  if (session?.authenticated) return <AuthContext.Provider value={{ logout, seeGuide, username: session.username,
    role: (session.role || "user") as Role, guidesSeen: session.guides_seen ?? [] }}>{children}</AuthContext.Provider>;
  const setup = session && !session.configured;
  return <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-5">
    <form className="w-full max-w-sm rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-8 shadow-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        if (setup && password !== repeat) { setError("两次输入的密码不一致"); return; }
        setBusy(true); setError("");
        try {
          const response = await fetch("/api/auth/" + (setup ? "setup" : "login"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: setup ? "admin" : username.trim(), password }),
          });
          const value = await response.json();
          if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : "请检查密码，首次密码至少 10 个字符");
          setPassword(""); setRepeat(""); await load();
        } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
      }}>
      <p className="text-sm font-semibold text-[var(--primary)]">DoxAgent · 资料工作台</p>
      <h1 className="mt-3 text-2xl font-semibold">{setup ? "设置管理员密码" : "登录"}</h1>
      <p className="mt-2 text-sm text-[var(--steel)]">{setup ? "首次使用，设置此项目的管理员密码。" : "登录后继续查看资料、分析与审查任务。"}</p>
      <label className="mt-6 block text-sm">账户<input className="mt-2 w-full rounded-lg border p-3" value={setup ? "admin" : username} readOnly={Boolean(setup)}
        required autoComplete="username" onChange={(e) => setUsername(e.target.value)} /></label>
      <label className="mt-4 block text-sm">密码<input className="mt-2 w-full rounded-lg border p-3" type="password" required
        minLength={setup ? 10 : 1} maxLength={256} autoComplete={setup ? "new-password" : "current-password"}
        value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {setup ? <label className="mt-4 block text-sm">再次输入密码<input className="mt-2 w-full rounded-lg border p-3" type="password"
        required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-[var(--red)]">{error}</p> : null}
      <button className="mt-6 w-full rounded-lg bg-[var(--primary)] p-3 text-white disabled:opacity-50"
        disabled={busy || !session}>{busy ? "正在登录…" : setup ? "设置并进入" : "登录"}</button>
      {!session ? <button type="button" className="mt-3 text-sm text-[var(--link)]" onClick={() => void load()}>重新连接</button> : null}
    </form>
  </main>;
}
