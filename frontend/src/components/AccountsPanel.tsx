import { useEffect, useState } from "react";
import { ROLE_LABEL, useAuth, type Role } from "../auth";
import { Button } from "./ui";

type Account = { username: string; role: Role; created: number };

async function call(path: string, init?: RequestInit): Promise<Account[]> {
  const response = await fetch("/api/auth/accounts" + path, { ...init, headers: { "Content-Type": "application/json" } });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : "账户操作失败");
  return value as Account[];
}

/** Administrator-only account list (query 2026-1013 1133): add leader/admin/user accounts, reset, delete. */
export function AccountsPanel() {
  const { role, username: me } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState({ username: "", password: "", role: "leader" as Role });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (role === "admin") void call("").then(setAccounts, (e: Error) => setError(e.message)); }, [role]);
  if (role !== "admin") return null;
  const run = async (action: () => Promise<Account[]>, done: string) => {
    setError(""); setNotice("");
    try { setAccounts(await action()); setNotice(done); } catch (e) { setError((e as Error).message); }
  };
  const input = "min-w-0 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1.5 text-body";
  return <section aria-label="账户管理" className="mt-[22px]">
    <h3 className="text-body font-semibold text-[var(--ink)]">账户</h3>
    <p className="mt-1 text-caption leading-[1.6] text-[var(--stone)]">领导账户登录后进入精简的领域全景；管理员与普通用户进入完整系统，只有管理员能管理账户。</p>
    <ul className="mt-2">{accounts.map((a) => <li key={a.username} className="flex items-center gap-2 border-b border-[var(--hairline)] py-[7px] text-body">
      <span className="min-w-0 flex-1 truncate font-medium">{a.username}{a.username === me ? "（当前）" : ""}</span>
      <select aria-label={`${a.username} 的角色`} className={input} value={a.role}
        onChange={(e) => void run(() => call("/" + encodeURIComponent(a.username), { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }), "角色已更新")}>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <button type="button" className="text-xs text-[var(--link)]" onClick={() => {
        const password = window.prompt(`为 ${a.username} 设置新密码（至少 4 个字符）`, "123456");
        if (password) void run(() => call("/" + encodeURIComponent(a.username), { method: "PATCH", body: JSON.stringify({ password }) }), "密码已重置，该账户需重新登录");
      }}>重置密码</button>
      {a.username !== me ? <button type="button" className="text-xs text-[var(--red)]" onClick={() => {
        if (window.confirm(`删除账户 ${a.username}？`)) void run(() => call("/" + encodeURIComponent(a.username), { method: "DELETE" }), "账户已删除");
      }}>删除</button> : null}
    </li>)}</ul>
    <form className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={(e) => {
      e.preventDefault();
      void run(() => call("", { method: "POST", body: JSON.stringify({ ...draft, password: draft.password || "123456" }) }), `已添加 ${draft.username}`).then(() => setDraft({ username: "", password: "", role: draft.role }));
    }}>
      <input aria-label="新账户名" placeholder="账户名" required className={input} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
      <input aria-label="新账户密码" placeholder="密码，默认 123456" type="password" minLength={4} autoComplete="new-password" className={input}
        value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
      <select aria-label="新账户角色" className={input} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <Button size="sm" type="submit" className="col-span-3 justify-self-start">添加账户</Button>
    </form>
    {error ? <p role="alert" className="mt-2 text-caption text-[var(--red)]">{error}</p> : null}
    {notice ? <p role="status" className="mt-2 text-caption text-[var(--steel)]">{notice}</p> : null}
  </section>;
}
