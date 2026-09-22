import { useState, type ReactNode } from "react";
import { useApp } from "../store";
import { Icon } from "./Icons";
import { Button, Card, Pill } from "./ui";
import { documentMeta } from "../documentMeta";

type InspTab = "out" | "cite" | "src";

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-[10px] flex items-center gap-[8px]">
      <span className="text-[11px] font-semibold tracking-[0.5px] text-[var(--stone)] uppercase">
        {children}
      </span>
      <span className="flex-1" />
      {aside}
    </div>
  );
}

export function Inspector() {
  const {
    inspectorOpen,
    toggleInspector,
    handleOpenSource,
    turns,
    currentCorpus,
    activeTask,
    taskCapable,
    documents,
    openDocument,
    corpusReady,
    workspace,
    options,
    showToast,
  } = useApp();
  const [tab, setTab] = useState<InspTab>("out");

  const latest = turns[turns.length - 1];
  const answered = turns.filter((t) => t.outcome === "completed").length;
  const citations = latest?.sources ?? [];

  return (
    <aside
      aria-hidden={!inspectorOpen}
      className={`fixed top-[10px] right-[10px] bottom-[10px] z-[70] flex w-[404px] max-w-[94vw] flex-col overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-soft)] shadow-[-24px_8px_60px_-24px_rgba(15,15,15,0.28)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        inspectorOpen ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+20px)]"
      }`}
    >
      <div className="flex items-center gap-[8px] px-[18px] pt-[14px] pb-[12px]">
        <span className="text-[13.5px] font-semibold tracking-[-0.1px] text-[var(--ink)]">
          产出面板
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--stone)]">
          {activeTask && taskCapable ? `· ${activeTask.name}` : "· 专业问答"}
        </span>
        <button
          type="button"
          title="收起面板"
          onClick={toggleInspector}
          className="grid size-[26px] shrink-0 place-items-center rounded-[6px] text-[var(--steel)] hover:bg-[var(--surface)]"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="flex gap-[4px] border-b border-[var(--hairline)] px-[14px]">
        {(
          [
            ["out", "概览"],
            ["cite", "引用"],
            ["src", "原文预览"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`font-app -mb-px rounded-t-[6px] border-b-2 px-[10px] py-[8px] text-[12.5px] transition-colors ${
              tab === key
                ? "border-b-[var(--ink)] font-semibold text-[var(--ink)]"
                : "border-b-transparent text-[var(--steel)] hover:text-[var(--charcoal)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[18px] pt-[18px] pb-[20px]">
        {tab === "out" ? (
          <>
            <SectionTitle
              aside={
                <span className="text-[11px] text-[var(--stone)]">本轮会话 · {answered} 轮已答</span>
              }
            >
              概览
            </SectionTitle>
            <Card className="mb-[10px]">
              <div className="text-[13px] font-medium text-[var(--ink)]">
                {currentCorpus?.name ?? "未选择知识库"}
              </div>
              <div className="mt-[6px] flex flex-wrap items-center gap-[8px] text-[11.5px] text-[var(--stone)]">
                <Pill tone={corpusReady ? "mint" : "yellow"}>
                  {corpusReady ? "已就绪" : "准备中"}
                </Pill>
                <span>{documents.length} 份文档</span>
                {options.allowed_doc_ids ? (
                  <span>限定 {options.allowed_doc_ids.length} 份</span>
                ) : (
                  <span>全部资料</span>
                )}
              </div>
            </Card>

            <Card className="mb-[10px]">
              <div className="text-[12.8px] font-medium text-[var(--ink)]">结构化报告</div>
              <p className="mt-[6px] text-[12px] leading-[1.6] text-[var(--steel)]">
                专项报告（task4）通过统一报告入口生成，后端 <code className="font-code">POST /api/reports</code>{" "}
                就绪后在此展示与下载。
              </p>
              <div className="mt-[10px] flex gap-[8px]">
                {taskCapable ? (
                  <Button size="sm" disabled title="报告接口未实现">
                    生成报告
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => showToast("报告接口未实现（E 阶段）")}>
                  说明
                </Button>
              </div>
            </Card>

            <SectionTitle>会话</SectionTitle>
            <Card>
              <div className="text-[12.5px] text-[var(--charcoal)]">{workspace.message}</div>
              <div className="mt-[6px] text-[11.5px] text-[var(--stone)]">
                共 {workspace.sessions.length} 个会话 · {workspace.branches.length} 个分支
              </div>
            </Card>
          </>
        ) : null}

        {tab === "cite" ? (
          <SectionTitle
            aside={<span className="text-[11px] text-[var(--stone)]">{citations.length} 处引用</span>}
          >
            本轮引用片段
          </SectionTitle>
        ) : null}

        {tab === "cite" && !citations.length ? (
          <Card>
            <p className="text-[12.5px] leading-[1.6] text-[var(--steel)]">
              本轮回答还没有引用。提问后，命中资料的来源会在这里逐条列出。
            </p>
          </Card>
        ) : null}

        {tab === "cite" ? (
          <div className="flex flex-col gap-[10px]">
            {citations.map((s, i) => {
              const n = s.citation ?? i + 1;
              return (
                <Card key={`${n}-${i}`}>
                  <div className="flex items-start gap-[8px]">
                    <span className="mt-[2px] grid size-[16px] shrink-0 place-items-center rounded-[4px] bg-[var(--primary)] text-[10px] font-bold text-white">
                      {n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.8px] leading-[1.45] font-medium text-[var(--ink)]">
                        {s.title}
                      </div>
                      <div className="mt-[3px] text-[11.5px] text-[var(--stone)]">
                        第 {s.page ?? 1} 页
                      </div>
                    </div>
                  </div>
                  <p className="mt-[10px] text-[12.5px] leading-[1.7] text-[var(--slate)]">
                    {s.snippet}
                  </p>
                  <div className="mt-[8px] flex items-center justify-between gap-2">
                    <span className="truncate text-[10.5px] text-[var(--stone)]">
                      版本 {s.version ?? "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenSource(s, n)}
                      className="font-app inline-flex shrink-0 items-center gap-[5px] text-[12px] text-[var(--link)] hover:underline"
                    >
                      查看原文
                      <Icon name="chevronRight" size={11} strokeWidth={2.4} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {tab === "src" ? (
          <>
            <SectionTitle
              aside={
                <span className="text-[11px] text-[var(--stone)]">
                  {currentCorpus ? currentCorpus.name : "未选择"}
                </span>
              }
            >
              原文预览
            </SectionTitle>
            <p className="mb-[12px] text-[12px] leading-[1.6] text-[var(--steel)]">
              浏览不会改变检索范围；打开后为 PDF 原文或规范化正文。
            </p>
            {!corpusReady ? (
              <Card>
                <p className="text-[12.5px] text-[var(--steel)]">知识库就绪后即可浏览。</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {documents.slice(0, 60).map((doc) => (
                  <button
                    key={doc.doc_id}
                    type="button"
                    onClick={() => openDocument(doc.doc_id)}
                    className="flex items-center gap-[11px] rounded-[8px] px-[8px] py-[9px] text-left transition-colors hover:bg-[var(--surface)]"
                  >
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-[5px] bg-[var(--tint-sky)] text-[var(--link)]">
                      <Icon name="doc" size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.8px] font-medium text-[var(--ink)]">
                        {doc.title}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--stone)]">
                        {documentMeta(doc)}
                      </span>
                    </span>
                  </button>
                ))}
                {!documents.length ? (
                  <Card>
                    <p className="text-[12.5px] text-[var(--steel)]">当前知识库还没有已入库文档。</p>
                  </Card>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}
