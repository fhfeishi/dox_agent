import { useState } from "react";
import { Button, Card } from "./ui";

type Preview = { preview_id: string; title: string; pages: { number: number; text: string }[] };

async function api(path: string, body?: object) {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "请求失败");
  return data;
}

const fieldCls =
  "font-app w-full rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[9px] py-[6px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--primary)]";

/**
 * Extra material import for the **default corpus only**: `/api/ingest/local`,
 * `/api/ingest/text` and `/api/web/*` all write to the default knowledge base, so this must
 * not be shown in a non-default corpus detail (the UI would otherwise imply a wrong target).
 */
export function IngestTools({ refresh, connected = true }: { refresh: () => void; connected?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [origin, setOrigin] = useState("");
  const [text, setText] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("正在处理…");
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function ingestText() {
    await run(async () => {
      const result = await api("/api/ingest/text", { title, origin, text });
      setNotice(`正文已入库（${result.changed ? "新版本" : "版本未变"}），可以重新提问。`);
      setText("");
      refresh();
    });
  }

  return (
    <div className="space-y-[10px] text-[13px]">
      <Button
        variant="quiet"
        size="sm"
        icon="plus"
        iconSize={13}
        disabled={busy || !connected}
        onClick={() =>
          void run(async () => {
            const result = await api("/api/ingest/local", {});
            setNotice(
              `导入完成：新增 ${result.added ?? result.imported.length} · 更新 ${result.updated ?? 0} · 跳过 ${result.skipped ?? 0} · 删除 ${result.deleted ?? 0}；失败 ${result.errors.length} 份`,
            );
            refresh();
          })
        }
      >
        扫描默认库本地目录
      </Button>

      <details className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[10px] py-[8px]">
        <summary className="cursor-pointer text-[12px] text-[var(--steel)]">网页快照</summary>
        <div className="mt-[8px] space-y-[8px]">
          <input
            aria-label="网页地址"
            className={fieldCls}
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            size="sm"
            disabled={busy || !url.trim() || !connected}
            onClick={() =>
              void run(async () => {
                setPreview(null);
                setPreview(await api("/api/web/preview", { url }));
                setNotice("请确认预览是正文，而非登录页或验证码。");
              })
            }
          >
            抓取并预览
          </Button>
        </div>
      </details>

      <details className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[10px] py-[8px]">
        <summary className="cursor-pointer text-[12px] text-[var(--steel)]">补充正文</summary>
        <div className="mt-[8px] space-y-[8px]">
          <input
            aria-label="补充标题"
            className={fieldCls}
            placeholder="标题"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            aria-label="补充来源"
            className={fieldCls}
            placeholder="原始来源（相同来源会更新版本）"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          />
          <textarea
            aria-label="补充正文"
            className={fieldCls}
            rows={6}
            maxLength={500000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" disabled={busy || !title.trim() || !text.trim() || !connected} onClick={() => void ingestText()}>
            保存正文
          </Button>
        </div>
      </details>

      {notice ? (
        <p className="text-[12px] leading-[1.6] text-[var(--steel)]" role="status">
          {notice}
        </p>
      ) : null}

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="网页入库预览"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-[20px]"
        >
          <Card className="flex max-h-[85vh] w-full max-w-[720px] flex-col p-[20px]">
            <h2 className="text-[14px] font-semibold text-[var(--ink)]">{preview.title}</h2>
            <p className="my-[10px] text-[12.5px] text-[var(--steel)]">确认内容正确后，保存这份文本快照。</p>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-[8px] bg-[var(--surface-sink)] p-[14px] text-[12px] leading-[1.7]">
              {preview.pages.map((p) => p.text).join("\n\n")}
            </pre>
            <div className="mt-[16px] flex justify-end gap-[8px]">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPreview(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api("/api/web/confirm/" + preview.preview_id, {});
                    setPreview(null);
                    refresh();
                    setNotice("网页快照已入库");
                  })
                }
              >
                确认入库
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
