import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, useAuth } from "../auth";
import { GUIDE_EVENT } from "./Guide";

/**
 * The account at the right of the top bar (query 2026-1013 1520 / 1522): an avatar that opens a small menu
 * with the account and its role group, the page guide, password change and sign-out.
 */
export function UserMenu() {
  const { username, role, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ old: "", next: "" });
  const [message, setMessage] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setChanging(false); } };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setChanging(false); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function change() {
    setMessage("");
    const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old: form.old, new: form.next }) });
    const value = await response.json().catch(() => null);
    if (!response.ok) { setMessage(typeof value?.detail === "string" ? value.detail : "修改失败"); return; }
    setForm({ old: "", next: "" }); setChanging(false); setMessage("密码已修改");
  }
  const item = "block w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface)]";
  return <div ref={box} className="relative shrink-0">
    <button type="button" aria-label={`账户：${username}`} aria-expanded={open} onClick={() => { setOpen(!open); setMessage(""); }}
      className="grid size-8 place-items-center rounded-full bg-[var(--primary)] text-sm font-semibold text-white hover:opacity-90">
      {username.slice(0, 1).toUpperCase()}
    </button>
    {open ? <div role="menu" aria-label="账户菜单" className="fixed top-[52px] right-3 z-[90] w-[230px] rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-2 shadow-xl">
      <div className="border-b border-[var(--hairline)] px-3 pt-1 pb-2">
        <p className="truncate text-[14px] font-semibold">{username}</p>
        <p className="text-xs text-[var(--steel)]">{ROLE_LABEL[role]}</p>
      </div>
      <button type="button" role="menuitem" className={item + " mt-1"} onClick={() => { setOpen(false); window.dispatchEvent(new Event(GUIDE_EVENT)); }}>本页操作指南</button>
      <button type="button" role="menuitem" className={item} onClick={() => setChanging(!changing)}>修改密码</button>
      {changing ? <form className="space-y-1.5 px-3 py-2" onSubmit={(e) => { e.preventDefault(); void change(); }}>
        <input aria-label="原密码" type="password" placeholder="原密码" required autoComplete="current-password" value={form.old}
          onChange={(e) => setForm({ ...form, old: e.target.value })} className="w-full rounded-md border border-[var(--hairline)] px-2 py-1 text-xs" />
        <input aria-label="新密码" type="password" placeholder="新密码（至少 4 位）" required minLength={4} autoComplete="new-password" value={form.next}
          onChange={(e) => setForm({ ...form, next: e.target.value })} className="w-full rounded-md border border-[var(--hairline)] px-2 py-1 text-xs" />
        <button type="submit" className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs text-white">保存</button>
      </form> : null}
      {message ? <p role="status" className="px-3 py-1 text-xs text-[var(--steel)]">{message}</p> : null}
      <button type="button" role="menuitem" className={item + " text-[var(--red)]"} onClick={() => void logout()}>退出登录</button>
    </div> : null}
  </div>;
}
