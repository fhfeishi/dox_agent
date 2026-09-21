import { useEffect, useState } from "react";

type Job = { status: string; total: number; completed: number; imported: number; errors: { url?: string; error: string }[] };

export function OfficialDocs({ connected = true }: { connected?: boolean }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/official-docs");
        if (!response.ok) throw new Error("无法读取文档更新状态");
        const result = await response.json();
        if (!stopped) { setJob(result); setConnectionError(""); }
      } catch { if (!stopped) setConnectionError("文档更新状态暂不可用，正在重新连接。"); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [connected]);
  async function update() {
    setSending(true); setError("");
    try {
      const response = await fetch("/api/official-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error((await response.json()).detail || "无法启动更新");
      setJob(await response.json());
    } catch (exception) { setError(String(exception)); }
    finally { setSending(false); }
  }
  return <section className="mt-6 text-sm">
    <h2 className="font-semibold">在线文档源</h2>
    <p className="my-2 text-xs text-stone-500">按服务端配置的来源与分区导入，可重复更新以获取最新版本。</p>
    <button disabled={sending || job?.status === "running"} onClick={() => void update()} className="w-full rounded-lg border bg-white p-2 disabled:opacity-40">导入 / 更新在线文档</button>
    {job && job.status !== "idle" && <p role="status" className="mt-2 text-xs">{job.status === "running" ? "更新中" : job.status === "done" ? "更新完成" : "更新有失败项"} · {job.completed}/{job.total} · 成功 {job.imported}</p>}
    {!!job?.errors.length && <details className="mt-2 text-xs"><summary>失败 {job.errors.length} 项（再次更新可重试）</summary>{job.errors.map((item, index) => <p key={index}>{item.url} {item.error}</p>)}</details>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {connectionError && <p role="alert" className="text-xs text-red-700">{connectionError}</p>}
  </section>;
}
