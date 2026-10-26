import type { Role } from "./auth";

/** The signed-in session, accounts and passwords (src/auth.py). */
export type Session = { authenticated: boolean; username: string; role: Role | ""; guides_seen: string[] };
export type Account = { username: string; role: Role; created: number };

async function json<T>(response: Response, fallback: string): Promise<T> {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof value?.detail === "string" ? value.detail : fallback);
  return value as T;
}

export async function fetchSession(): Promise<Session> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) throw new Error("无法连接登录服务");
  return response.json();
}

export async function login(username: string, password: string, remember = true): Promise<void> {
  await json(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, remember }) }), "请检查账户和密码");
}

/** True once the session is gone (also when it had already expired). */
export async function logout(): Promise<boolean> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  return response.ok || response.status === 401;
}

export function markGuideSeen(key: string) {
  void fetch("/api/auth/guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
}

export async function changePassword(old: string, next: string): Promise<void> {
  await json(await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old, new: next }) }), "修改失败");
}

/** Administrator-only: the account list, or a change to it; `path` is "" or "/<username>…". */
export async function accountsRequest(path: string, init?: RequestInit): Promise<Account[]> {
  return json(await fetch("/api/auth/accounts" + path, { ...init, headers: { "Content-Type": "application/json" } }), "账户操作失败");
}
