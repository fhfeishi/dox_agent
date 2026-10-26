import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchSession, login, logout as signOut, markGuideSeen, type Session } from "./authApi";

/** Roles choose the interface (query 2026-1013 1133): leader = lean leader view, admin = full + accounts, user = full. */
export type Role = "admin" | "leader" | "user";
type Auth = { logout: () => Promise<void>; username: string; role: Role; guidesSeen: string[]; seeGuide: (key: string) => void };
const AuthContext = createContext<Auth>({ logout: async () => {}, username: "", role: "user", guidesSeen: [], seeGuide: () => {} });
export const useAuth = () => useContext(AuthContext);
export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", leader: "领导", user: "普通用户" };

function rememberedLogin() {
  try {
    const value = JSON.parse(localStorage.getItem("dox-login") ?? "null");
    if (typeof value?.username === "string" && value.username.length <= 80)
      return { username: value.username, remember: value.remember !== false };
  } catch { /* Browser storage may be unavailable; signing in still works. */ }
  return { username: "admin", remember: true };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [saved] = useState(rememberedLogin);
  const [username, setUsername] = useState(saved.username);
  const [remember, setRemember] = useState(saved.remember);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setSession(await fetchSession()); setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60000);
    return () => { window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, []);
  async function logout() {
    if (await signOut()) {
      setSession((old) => old ? { ...old, authenticated: false } : null);
      window.location.assign("/");
    }
  }
  function seeGuide(key: string) {
    setSession((old) => old ? { ...old, guides_seen: [...new Set([...old.guides_seen, key])] } : old);
    markGuideSeen(key);
  }
  if (session?.authenticated) return <AuthContext.Provider value={{ logout, seeGuide, username: session.username,
    role: (session.role || "user") as Role, guidesSeen: session.guides_seen ?? [] }}>{children}</AuthContext.Provider>;
  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--surface)]">
    <p role="status" className="text-body text-[var(--steel)]">正在恢复登录…</p>
  </main>;
  return <main className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-5">
    <form className="w-full max-w-sm rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-8 shadow-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setError("");
        try {
          await login(username.trim(), password, remember);
          try { localStorage.setItem("dox-login", JSON.stringify({ username: username.trim(), remember })); } catch { /* optional */ }
          setPassword(""); await load();
        } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
      }}>
      <p className="text-body font-semibold text-[var(--primary)]">DoxAgent · 资料工作台</p>
      <h1 className="mt-3 text-page font-semibold">登录</h1>
      <p className="mt-2 text-body text-[var(--steel)]">初始账户 admin，默认密码 123456；登录后可在“设置 → 账户”修改。</p>
      <label className="mt-6 block text-body">账户<input name="username" className="mt-2 w-full rounded-lg border p-3" value={username}
        required autoComplete="username" onChange={(e) => setUsername(e.target.value)} /></label>
      <label className="mt-4 block text-body">密码<input name="password" className="mt-2 w-full rounded-lg border p-3" type="password" required
        maxLength={256} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-body text-[var(--slate)]">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />保持登录 30 天
      </label>
      <p className="mt-2 text-caption text-[var(--steel)]">下次直接进入；公用设备可取消勾选。</p>
      {error ? <p role="alert" className="mt-4 text-body text-[var(--red)]">{error}</p> : null}
      <button className="mt-6 w-full rounded-lg bg-[var(--primary)] p-3 text-white disabled:opacity-50"
        disabled={busy || !session}>{busy ? "正在登录…" : "登录"}</button>
      {!session ? <button type="button" className="mt-3 text-body text-[var(--link)]" onClick={() => void load()}>重新连接</button> : null}
    </form>
  </main>;
}
