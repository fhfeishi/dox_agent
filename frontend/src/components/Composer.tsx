import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../store";
import { confirmWeb, previewSearchResult, previewWeb, searchWeb, webSearchCapability, type WebPreview, type WebSearch } from "../api";
import { Icon } from "./Icons";
import { CorpusPicker } from "./CorpusPicker";
import { ScopeSelector } from "./ScopeSelector";

function PopItem({
  title,
  description,
  tone,
  onClick,
  icon,
}: {
  title: string;
  description: string;
  tone?: string;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-app flex w-full items-start gap-[10px] rounded-[6px] px-[9px] py-[8px] text-left hover:bg-[var(--surface)]"
    >
      <span
        className="grid size-[26px] shrink-0 place-items-center rounded-[6px] bg-[var(--tint-lavender)] text-[var(--purple)]"
        style={tone ? { background: tone } : undefined}
      >
        {icon ?? <Icon name="tasks" size={14} strokeWidth={1.9} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-[1.35] font-medium text-[var(--ink)]">{title}</span>
        <span className="mt-[1px] block text-[11.5px] leading-[1.4] text-[var(--stone)]">
          {description}
        </span>
      </span>
    </button>
  );
}

export function Composer() {
  const {
    input,
    setInput,
    send,
    stop,
    busy,
    ready,
    connected,
    workspace,
    editing,
    setEditing,
    confirmEdit,
    options,
    setOptions,
    scopeDocuments,
    scopeDocumentsError,
    corpora,
    effectiveCorpusId,
    corporaError,
    corporaLoaded,
    refreshCorpora,
    selectCorpus,
    tasks,
    tasksError,
    taskId,
    activeTask,
    taskVersionState,
    taskVersionError,
    upgradeTaskVersion,
    startTask,
    taskCapable,
    currentCorpus,
    corpusIds,
    setSearchCorpusIds,
    setNewCorpusOpen,
    openCorpus,
    runCorpusIngest,
    ingestBusy,
    showToast,
    status,
    model,
  } = useApp();

  const [popOpen, setPopOpen] = useState(false);
  const [corpusOpen, setCorpusOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [webOpen, setWebOpen] = useState(false);
  const [webMode, setWebMode] = useState<"url" | "search">("url");
  const [webUrl, setWebUrl] = useState("");
  const [webPreviews, setWebPreviews] = useState<WebPreview[]>([]);
  const [webTarget, setWebTarget] = useState("");
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState("");
  const [searchAvailable, setSearchAvailable] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDomains, setSearchDomains] = useState("");
  const [searchTime, setSearchTime] = useState<"any" | "month" | "year">("any");
  const [searchResult, setSearchResult] = useState<WebSearch | null>(null);
  const [searchSelected, setSearchSelected] = useState<string[]>([]);
  const [searchPreviewed, setSearchPreviewed] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const corpusRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (!webOpen || webMode !== "search") return;
    void webSearchCapability().then((value) => setSearchAvailable(value.available), () => setSearchAvailable(false));
  }, [webOpen, webMode]);

  // One dismiss handler for every composer popover: click outside closes that popover,
  // Escape closes all of them.
  useEffect(() => {
    if (!popOpen && !corpusOpen && !scopeOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popOpen && !popRef.current?.contains(target)) setPopOpen(false);
      if (corpusOpen && !corpusRef.current?.contains(target)) setCorpusOpen(false);
      if (scopeOpen && !scopeRef.current?.contains(target)) setScopeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPopOpen(false);
      setCorpusOpen(false);
      setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popOpen, corpusOpen, scopeOpen]);

  const scopeReady = !corporaError && corpusIds.length > 0 && corpusIds.length <= 6 &&
    corpusIds.every((id) => corpora.some((item) => item.id === id && !item.missing));
  const emptyScopeCorpus = corpora.find((item) => corpusIds.includes(item.id) && item.preparation !== "ready");
  const repairScope = !corpusIds.length || corpusIds.length > 6 ||
    corpusIds.some((id) => !corpora.some((item) => item.id === id && !item.missing));
  const taskParams = options.task_params ?? {};
  const taskFields = activeTask?.parameters ?? [];
  const taskInputsValid = taskFields.every((field) => {
    const value = taskParams[field.key] ?? field.default;
    if (value == null || value === "") return !field.required;
    if (field.type === "integer") return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 1_000_000;
    if (field.type === "enum") return field.options?.includes(String(value));
    if (field.type === "boolean") return typeof value === "boolean";
    if (field.type === "year_range") {
      const years = value as { from?: number; to?: number };
      return Number.isInteger(years?.from) && Number.isInteger(years?.to) &&
        (years.from ?? 0) >= 1900 && (years.to ?? 0) <= 2100 && (years.from ?? 0) <= (years.to ?? 0);
    }
    return typeof value === "string" && value.length <= 500;
  });
  const listedTask = tasks.find((task) => task.id === taskId);
  const customTask = listedTask?.kind === "custom";
  const missingCustomTask = tasks.length > 0 && !listedTask && taskId.startsWith("custom-");
  const taskReady = !customTask && !missingCustomTask || (taskVersionState === "ready" && Boolean(activeTask));
  const latestVersion = listedTask?.version;
  const versionUpdateAvailable = customTask && Boolean(workspace.taskVersion && latestVersion && workspace.taskVersion < latestVersion);
  const canSend = input.trim().length > 0 && !busy && ready && workspace.loaded && connected && scopeReady && taskInputsValid && taskReady;
  function setTaskParam(key: string, value: unknown) {
    setOptions((current) => {
      const next = { ...current.task_params };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...current, task_params: next };
    });
  }
  const scoped = options.allowed_doc_ids?.length ?? 0;
  async function addWebPreview() {
    setWebBusy(true); setWebError("");
    try {
      const preview = await previewWeb(webUrl.trim());
      setWebPreviews((items) => [...items, preview]);
      setWebUrl("");
    } catch (error) {
      setWebError(error instanceof Error ? error.message : "网页预览失败");
    } finally { setWebBusy(false); }
  }
  async function acceptWeb(previewId: string, destination: "run" | "corpus") {
    if (destination === "corpus" && !webTarget) { setWebError("请选择目标知识库"); return; }
    setWebBusy(true); setWebError("");
    try {
      const result = await confirmWeb(previewId, destination === "run"
        ? { save_for_run: true } : { target_corpus_id: webTarget });
      setWebPreviews((items) => items.filter((item) => item.preview_id !== previewId));
      if (destination === "run") {
        setOptions((current) => ({ ...current,
          web_snapshot_ids: [...new Set([...(current.web_snapshot_ids ?? []), result.web_snapshot_id])] }));
        showToast("网页快照已加入本次运行范围");
      } else {
        void refreshCorpora();
        showToast("网页资料已加入所选知识库");
      }
    } catch (error) {
      setWebError(error instanceof Error ? error.message : "网页确认失败");
    } finally { setWebBusy(false); }
  }
  async function runSearch() {
    setWebBusy(true); setWebError(""); setSearchResult(null); setSearchSelected([]); setSearchPreviewed([]);
    try {
      const domains = searchDomains.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean);
      const result = await searchWeb(searchQuery.trim(), domains, searchTime);
      setSearchResult(result);
    } catch (error) {
      setWebError(error instanceof Error ? error.message : "网络搜索失败");
    } finally { setWebBusy(false); }
  }
  async function previewSelected() {
    if (!searchResult || !searchSelected.length) return;
    setWebBusy(true); setWebError("");
    const failed: string[] = [];
    for (const resultId of searchSelected) {
      try {
        const preview = await previewSearchResult(searchResult.search_id, resultId);
        setWebPreviews((items) => [...items, preview]);
        setSearchPreviewed((items) => [...items, resultId]);
      } catch (error) {
        failed.push(error instanceof Error ? error.message : "预览失败");
      }
    }
    setSearchSelected([]);
    if (failed.length) setWebError(failed.join("；"));
    setWebBusy(false);
  }

  return (
    <div className="shrink-0 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent px-[32px] pb-[20px]">
      <div className="mx-auto w-full max-w-[820px]">
        {!scopeReady ? (
          <div role="status" className="mb-[8px] flex items-center gap-[10px] rounded-[9px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[11px] py-[8px] text-[12px] text-[var(--slate)]">
            <span className="min-w-0 flex-1">
              {corporaError
                ? `知识库列表读取失败：${corporaError}`
                : !corporaLoaded
                  ? "正在读取知识库列表…"
                  : !corpora.length
                  ? "尚无知识库，可新建知识库或刷新列表。"
                  : !corpusIds.length
                    ? "请选择当前对话使用的 1 至 6 个知识库。"
                    : corpusIds.length > 6
                      ? `此会话原范围包含 ${corpusIds.length} 个知识库，超过 6 个上限，请修复范围后再发送。`
                      : corpusIds.some((id) => !corpora.some((item) => item.id === id))
                        ? "此会话原范围含未知知识库，请修复范围后再发送。"
                        : corpusIds.some((id) => corpora.find((item) => item.id === id)?.missing)
                          ? "此会话原范围含目录缺失的知识库，请移除或重新关联。"
                          : "当前对话使用的范围不可用。"}
            </span>
            {corporaError ? <button type="button" className="shrink-0 rounded-[6px] border border-[var(--hairline-strong)] px-[9px] py-[5px] text-[11.5px]" onClick={() => refreshCorpora()}>重试刷新</button> : null}
            {!corporaError && corporaLoaded && repairScope ? (
              <button type="button" className="shrink-0 rounded-[6px] border border-[var(--hairline-strong)] px-[9px] py-[5px] text-[11.5px]" onClick={() => corpora.length ? setCorpusOpen(true) : setNewCorpusOpen(true)}>
                {corpora.length ? "选择知识库" : "新建知识库"}
              </button>
            ) : null}
          </div>
        ) : null}
        {editing ? (
          <div className="mb-[8px] flex items-center gap-[8px] rounded-[8px] border border-[#d5cdf7] bg-[var(--primary-soft)] px-[10px] py-[7px] text-[12px] text-[var(--primary-pressed)]">
            <Icon name="edit" size={13} strokeWidth={1.9} />
            <span className="flex-1">
              正在编辑第 {editing.index + 1} 轮的提问 · 确认后将从这条消息重新生成回答
            </span>
            <button
              type="button"
              className="font-app rounded-[5px] px-[7px] py-[2px] text-[11.5px] font-medium hover:bg-[#ddd5f8]"
              onClick={() => setEditing(null)}
            >
              取消
            </button>
          </div>
        ) : null}
        {(customTask || missingCustomTask) && !taskReady ? (
          <div role="status" className="mb-[8px] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[10px] py-[7px] text-[12px] text-[var(--steel)]">
            {taskVersionState === "missing" ? "此旧会话未记录任务版本，已阻止发送。" : taskVersionState === "failed" ? `${taskVersionError} 可从成组状态备份恢复，或新建最新版会话。` : "正在读取此会话固定的任务版本…"}
            {latestVersion ? <div className="mt-[5px] flex flex-wrap items-center gap-[7px]">
              {workspace.taskVersion ? <span>当前 v{workspace.taskVersion} / 最新 v{latestVersion}</span> : <span>最新 v{latestVersion}</span>}
              {workspace.taskVersion ? <button type="button" className="rounded-[5px] border border-[var(--hairline-strong)] px-[7px] py-[3px] text-[11.5px]" onClick={() => {
                if (window.confirm(`将此会话从任务 v${workspace.taskVersion} 升级到 v${latestVersion}？`)) void upgradeTaskVersion();
              }}>升级到最新版</button> : null}
              <button type="button" className="rounded-[5px] border border-[var(--hairline-strong)] px-[7px] py-[3px] text-[11.5px]" onClick={() => void startTask(taskId)}>新建最新版会话</button>
            </div> : null}
          </div>
        ) : null}

        {/* corpus + scope chips */}
        <div className="mb-[8px] flex flex-wrap items-center gap-[6px]">
          {currentCorpus ? (
            <span className="inline-flex max-w-[280px] items-center gap-[6px] rounded-full border border-[#d5cdf7] bg-[var(--primary-soft)] px-[9px] py-[4px] text-[12px] font-medium text-[var(--primary-pressed)]">
              <Icon name="library" size={12} strokeWidth={2} />
              <span className="truncate">上传目标：{currentCorpus.name}</span>
              <span className="text-[var(--primary)]">{currentCorpus.docs_count}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-[var(--stone)]">未选择知识库</span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setCorpusOpen((v) => !v)}
            className="font-app inline-flex items-center gap-[6px] rounded-full border border-[var(--hairline)] bg-[var(--canvas)] px-[9px] py-[4px] text-[12px] text-[var(--slate)] hover:border-[var(--hairline-strong)] disabled:opacity-50"
          >
            <Icon name="plus" size={12} strokeWidth={2.2} />
            管理知识库
          </button>
          <span className="max-w-[340px] truncate text-[11px] text-[var(--stone)]" title={corpusIds.map((id) => corpora.find((item) => item.id === id)?.name ?? id).join("、")}>
            当前对话：{corpusIds.length
              ? corpusIds.map((id) => corpora.find((item) => item.id === id)?.name ?? id).join("、")
              : "未选择"}（{corpusIds.length}/6）
          </span>
          {emptyScopeCorpus ? (
            <span className="flex items-center gap-[6px] text-[11px] text-[#9a6500]">
              「{emptyScopeCorpus.name}」暂无已入库文档
              <button type="button" className="text-[var(--link)] hover:underline" onClick={() => openCorpus(emptyScopeCorpus.id)}>
                添加文档
              </button>
              <button type="button" className="text-[var(--link)] hover:underline disabled:opacity-50" disabled={ingestBusy} onClick={() => void runCorpusIngest(emptyScopeCorpus.id)}>
                刷新本库
              </button>
            </span>
          ) : null}
        </div>

        <p aria-label="本次运行配置" className="mb-[7px] text-[11px] leading-[1.5] text-[var(--stone)]">
          本次配置：{activeTask?.name ?? taskId} · {corpusIds.length
            ? corpusIds.map((id) => corpora.find((item) => item.id === id)?.name ?? id).join("、")
            : "未选择知识库"} · {scoped ? `限定 ${scoped} 份资料` : "全部已入库资料"} · {options.web_snapshot_ids?.length ? `本地资料 + ${options.web_snapshot_ids.length} 个指定网址快照` : "本地资料 · 网络关闭"} · {model || "模型未记录"} · {taskId === "task4" || activeTask?.engine_task_id === "task4" ? "中文 Markdown 报告" : "中文回答，保留引用"}
        </p>

        {options.web_snapshot_ids?.length ? <div className="mb-[7px] flex items-center gap-[7px] text-[11px] text-[var(--steel)]">
          已确认网页快照 {options.web_snapshot_ids.length} 个
          <button type="button" className="text-[var(--link)]" onClick={() => setOptions((current) => ({ ...current, web_snapshot_ids: [] }))}>清除本次网页范围</button>
        </div> : null}

        {webOpen ? <div className="mb-[8px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-[10px] text-[12px]">
          <div className="mb-[7px] flex gap-[5px]">
            <button type="button" onClick={() => setWebMode("url")} className={webMode === "url" ? "font-semibold text-[var(--primary)]" : "text-[var(--stone)]"}>指定网址</button>
            <span>·</span>
            <button type="button" onClick={() => setWebMode("search")} className={webMode === "search" ? "font-semibold text-[var(--primary)]" : "text-[var(--stone)]"}>受控搜索</button>
          </div>
          {webMode === "url" ? <div className="flex gap-[6px]">
            <input aria-label="指定网址" type="url" value={webUrl} onChange={(event) => setWebUrl(event.target.value)} placeholder="https://example.com/article"
              className="min-w-0 flex-1 rounded border border-[var(--hairline)] px-[7px] py-[5px]" />
            <button type="button" disabled={webBusy || !webUrl.trim()} onClick={() => void addWebPreview()} className="rounded bg-[var(--primary)] px-[9px] text-white disabled:opacity-50">预览网页</button>
          </div> : <div className="space-y-[6px]">
            <p className="text-[var(--stone)]">先搜索指定域名，再勾选最多 3 条结果抓取；搜索不会自动进入回答。</p>
            {searchAvailable === false ? <p role="status" className="text-[var(--red)]">网络搜索未配置 FIRECRAWL_API_KEY</p> : null}
            <div className="flex gap-[6px]">
              <input aria-label="搜索问题" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="要查找的主题" className="min-w-0 flex-1 rounded border px-[7px] py-[5px]" />
              <input aria-label="允许的域名" value={searchDomains} onChange={(event) => setSearchDomains(event.target.value)} placeholder="example.org，最多 3 个" className="min-w-0 flex-1 rounded border px-[7px] py-[5px]" />
            </div>
            <div className="flex items-center gap-[7px]">
              <select aria-label="搜索时间范围" value={searchTime} onChange={(event) => setSearchTime(event.target.value as "any" | "month" | "year")} className="rounded border px-[5px] py-[4px]">
                <option value="any">不限时间</option><option value="month">近一月</option><option value="year">近一年</option>
              </select>
              <span className="text-[var(--stone)]">最多返回 5 条 · 每次最多预览 3 条</span>
              <button type="button" disabled={webBusy || searchAvailable === false || !searchQuery.trim() || !searchDomains.trim()} onClick={() => void runSearch()} className="ml-auto rounded bg-[var(--primary)] px-[9px] py-[4px] text-white disabled:opacity-50">搜索</button>
            </div>
            {searchResult ? <div aria-label="搜索结果" className="space-y-[4px]">
              <p className="text-[var(--stone)]">{searchResult.results.length} 条域内结果 · 有效至 {searchResult.expires_at}</p>
              {searchResult.results.map((item) => <label key={item.result_id} className="flex items-start gap-[6px] rounded border p-[5px]">
                <input type="checkbox" aria-label={`选择 ${item.title}`} checked={searchSelected.includes(item.result_id)} disabled={webBusy || searchPreviewed.includes(item.result_id) || (!searchSelected.includes(item.result_id) && searchSelected.length + searchPreviewed.length >= 3)} onChange={(event) => setSearchSelected((current) => event.target.checked ? [...current, item.result_id] : current.filter((id) => id !== item.result_id))} />
                <span><strong>{item.title}</strong><span className="block break-all text-[var(--stone)]">{item.url}</span>{item.snippet}</span>
              </label>)}
              {searchSelected.length ? <button type="button" disabled={webBusy} onClick={() => void previewSelected()} className="rounded border px-[7px] py-[4px]">预览所选 {searchSelected.length} 条</button> : null}
            </div> : null}
          </div>}
          {webError ? <p role="alert" className="mt-[5px] text-[var(--red)]">{webError}</p> : null}
          {webPreviews.map((item) => <div key={item.preview_id} className="mt-[8px] rounded border border-[var(--hairline)] p-[7px]">
            <p className="font-medium">{item.title} · {item.origin}</p>
            <p className="mt-[2px] max-h-[75px] overflow-auto text-[var(--steel)]">{item.markdown || item.pages.map((page) => page.text).join("\n").slice(0, 700)}</p>
            <p className="mt-[2px] text-[var(--stone)]">预览有效至 {item.expires_at}</p>
            <div className="mt-[5px] flex flex-wrap items-center gap-[6px]">
              <button type="button" disabled={webBusy} onClick={() => void acceptWeb(item.preview_id, "run")} className="rounded border px-[7px] py-[3px]">仅用于本次运行</button>
              <select aria-label="网页目标知识库" value={webTarget} onChange={(event) => setWebTarget(event.target.value)} className="rounded border px-[5px] py-[3px]">
                <option value="">选择目标库</option>{corpora.filter((corpus) => !corpus.missing).map((corpus) => <option key={corpus.id} value={corpus.id}>{corpus.name}</option>)}
              </select>
              <button type="button" disabled={webBusy || !webTarget} onClick={() => void acceptWeb(item.preview_id, "corpus")} className="rounded border px-[7px] py-[3px] disabled:opacity-50">加入所选知识库</button>
            </div>
          </div>)}
        </div> : null}

        {corpusOpen ? (
          <div ref={corpusRef} className="mb-[8px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[8px] shadow-[0_8px_24px_-12px_rgba(15,15,15,0.2)]">
            <CorpusPicker
              corpora={corpora}
              current={effectiveCorpusId ?? ""}
              selectedIds={corpusIds}
              disabled={busy}
              onToggle={(id, selected) => setSearchCorpusIds(selected ? [...corpusIds, id] : corpusIds.filter((entry) => entry !== id))}
              onUseOnly={(id) => setSearchCorpusIds([id])}
              onSelect={(id) => {
                selectCorpus(id);
              }}
            />
          </div>
        ) : null}

        {scopeOpen ? (
          <div ref={scopeRef} className="mb-[8px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[12px] shadow-[0_8px_24px_-12px_rgba(15,15,15,0.2)]">
            <ScopeSelector
              documents={scopeDocuments}
              selected={options.allowed_doc_ids}
              change={(ids) => setOptions((o) => ({ ...o, allowed_doc_ids: ids }))}
              disabled={busy || !connected || Boolean(scopeDocumentsError)}
            />
            {scopeDocumentsError ? <p role="alert" className="mt-[6px] text-[11px] text-[var(--red)]">{scopeDocumentsError}</p> : null}
          </div>
        ) : null}

        {activeTask?.kind === "custom" ? (
          <div className="mb-[8px] rounded-[9px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-[11px] py-[8px] text-[12px] text-[var(--slate)]">
            <div className="flex flex-wrap items-center gap-[7px]">
              <span>{versionUpdateAvailable ? `当前 v${workspace.taskVersion} / 最新 v${latestVersion}` : `任务 v${workspace.taskVersion ?? activeTask.version}`} · {corpusIds.length} 个知识库 · {scoped ? `${scoped} 份指定资料` : "全部资料"} · 网络关闭 · {activeTask.output_hint || "文本回答"}</span>
              {versionUpdateAvailable ? <button type="button" className="rounded-[5px] border border-[var(--hairline-strong)] px-[7px] py-[2px] text-[11px]" onClick={() => {
                if (window.confirm(`将此会话从任务 v${workspace.taskVersion} 升级到 v${latestVersion}？`)) void upgradeTaskVersion();
              }}>升级到最新版</button> : null}
            </div>
            {Object.entries(activeTask.parameter_defaults ?? {}).length ? <div className="mt-[3px]">文本默认：{Object.entries(activeTask.parameter_defaults ?? {}).map(([key, value]) => `${key}=${value}`).join("；")}</div> : null}
            {taskFields.length ? <div className="mt-[8px] flex flex-wrap gap-[8px]">{taskFields.map((field) => {
              const value = taskParams[field.key] ?? field.default;
              const year = (value ?? {}) as { from?: number; to?: number };
              return <label key={field.key} className="min-w-[130px] text-[11px]">{field.label}{field.required ? " *" : ""}
                {field.type === "enum" ? <select aria-label={field.label} value={String(value ?? "")}
                  onChange={(event) => setTaskParam(field.key, event.target.value || undefined)}
                  className="mt-[3px] block w-full rounded border border-[var(--hairline)] bg-[var(--canvas)] p-[5px]">
                    <option value="">请选择</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select> : field.type === "boolean" ? <select aria-label={field.label} value={value === true ? "true" : value === false ? "false" : ""}
                    onChange={(event) => setTaskParam(field.key, event.target.value ? event.target.value === "true" : undefined)}
                    className="mt-[3px] block w-full rounded border border-[var(--hairline)] bg-[var(--canvas)] p-[5px]">
                    <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
                  </select> : field.type === "year_range" ? <span className="mt-[3px] flex gap-[4px]">
                    <input aria-label={`${field.label}起`} type="number" min={1900} max={2100} value={year.from ?? ""}
                      onChange={(event) => setTaskParam(field.key, { ...year, from: event.target.value ? Number(event.target.value) : undefined })}
                      className="w-[72px] rounded border border-[var(--hairline)] bg-[var(--canvas)] p-[5px]" />
                    <input aria-label={`${field.label}止`} type="number" min={1900} max={2100} value={year.to ?? ""}
                      onChange={(event) => setTaskParam(field.key, { ...year, to: event.target.value ? Number(event.target.value) : undefined })}
                      className="w-[72px] rounded border border-[var(--hairline)] bg-[var(--canvas)] p-[5px]" />
                  </span> : <input aria-label={field.label} type={field.type === "integer" ? "number" : "text"}
                    value={String(value ?? "")} title={field.help}
                    onChange={(event) => setTaskParam(field.key, event.target.value === "" ? undefined : field.type === "integer" ? Number(event.target.value) : event.target.value)}
                    className="mt-[3px] block w-full rounded border border-[var(--hairline)] bg-[var(--canvas)] p-[5px]" />}
                {Object.hasOwn(taskParams, field.key) ? <button type="button" className="text-[var(--link)]" onClick={() => setTaskParam(field.key, undefined)}>使用默认</button> : null}
              </label>;
            })}</div> : null}
            {!taskInputsValid ? <p role="alert" className="mt-[5px] text-[var(--red)]">请填写有效的任务参数后发送。</p> : null}
          </div>
        ) : null}

        {/* input */}
        <div className="rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--canvas)] shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-[border-color,box-shadow] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--primary-soft)]">
          <textarea
            ref={taRef}
            rows={1}
            aria-label={editing ? "编辑历史问题" : "问题"}
            value={editing ? editing.text : input}
            disabled={!connected}
            maxLength={12000}
            onChange={(e) =>
              editing
                ? setEditing((cur) => (cur ? { ...cur, text: e.target.value } : cur))
                : setInput(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (editing) void confirmEdit();
                else if (canSend) void send();
              }
              if (e.key === "Escape" && editing) setEditing(null);
            }}
            placeholder={
              editing
                ? "修改后按 Enter 重新发送…"
                : taskCapable && taskId === "task4"
                  ? "描述报告需求：领域、年份范围、模板（成果/热点/未来/综合）…"
                  : "基于当前知识库提问，或点击 + 选择一项任务…"
            }
            className="font-app max-h-[180px] w-full resize-none border-0 bg-transparent px-[15px] pt-[13px] pb-[4px] text-[14px] leading-[1.6] text-[var(--ink)] outline-none placeholder:text-[var(--stone)] disabled:bg-white"
          />

          <div className="flex items-center gap-[6px] px-[9px] pt-[7px] pb-[9px]">
            <div ref={popRef} className="relative">
              <button
                type="button"
                title="任务 / 附件"
                aria-expanded={popOpen}
                onClick={() => setPopOpen((v) => !v)}
                className="grid size-[30px] place-items-center rounded-[6px] border border-[var(--hairline)] text-[var(--slate)] hover:bg-[var(--surface)]"
              >
                <Icon name="plus" size={16} strokeWidth={1.9} />
              </button>
              {popOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 z-[60] w-[296px] rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-[6px] shadow-[0_16px_48px_-8px_rgba(15,15,15,0.16)]">
                  <div className="px-[9px] pt-[8px] pb-[5px] text-[10.5px] font-semibold tracking-[0.6px] text-[var(--stone)] uppercase">
                    分析任务
                  </div>
                  {tasksError ? (
                    <p role="alert" className="px-[9px] py-[6px] text-[11.5px] text-[var(--red)]">
                      {tasksError}
                    </p>
                  ) : null}
                  {taskCapable && tasks.length ? (
                    tasks.filter((task) => !task.archived && (task.kind !== "custom" || Boolean(task.version))).map((task) => (
                      <PopItem
                        key={task.id}
                        title={task.name}
                        description={`${task.description} 示例：${task.example ?? task.output_hint ?? ""}`}
                        onClick={() => {
                          setPopOpen(false);
                          void startTask(task.id);
                        }}
                      />
                    ))
                  ) : (
                    <PopItem
                      title="新的问答"
                      description="直接提问，由服务端按固定专业流程作答"
                      icon={<Icon name="chat" size={14} strokeWidth={1.9} />}
                      onClick={() => {
                        setPopOpen(false);
                        void startTask("task1");
                      }}
                    />
                  )}
                  <span className="mx-[2px] my-[5px] block h-px bg-[var(--hairline-soft)]" />
                  <PopItem
                    title="导入文件"
                    description="PDF / Word / Markdown / TXT"
                    icon={<Icon name="upload" size={14} strokeWidth={1.9} />}
                    onClick={() => {
                      setPopOpen(false);
                      showToast("请在“设置与运维”中导入文件");
                    }}
                  />
                  <PopItem title="指定网址" description="先预览，再选择本次运行或一个知识库" onClick={() => {
                    setPopOpen(false); setWebMode("url"); setWebOpen(true);
                  }} />
                  <PopItem title="受控搜索" description="限定域名与时间，勾选结果后再抓取" onClick={() => {
                    setPopOpen(false); setWebMode("search"); setWebOpen(true);
                  }} />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setScopeOpen((v) => !v)}
              className="font-app inline-flex h-[30px] items-center gap-[6px] rounded-[6px] px-[9px] text-[12.5px] text-[var(--slate)] transition-colors hover:bg-[var(--surface)]"
            >
              <Icon name="list" size={15} />
              资料范围：
              <b className="font-semibold text-[var(--primary)]">{scoped ? `${scoped} 份` : "全部"}</b>
            </button>

            <span className="flex-1" />

            <span
              className="font-app hidden h-[30px] items-center gap-[6px] rounded-[6px] px-[9px] text-[12.5px] text-[var(--stone)] sm:inline-flex"
              title="首期为服务端固定单一模型，暂不支持切换"
            >
              <Icon name="info" size={14} />
              {taskCapable ? tasks.find((t) => t.id === taskId)?.name ?? "任务" : "专业问答"}
            </span>

            {busy ? (
              <button
                type="button"
                title="停止"
                aria-label="停止"
                onClick={stop}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--charcoal)] text-white transition-colors hover:bg-[var(--ink)]"
              >
                <Icon name="close" size={15} strokeWidth={2.2} />
              </button>
            ) : editing ? (
              <button
                type="button"
                title="确认修改并重新询问"
                aria-label="确认修改并重新询问"
                disabled={!editing.text.trim()}
                onClick={() => void confirmEdit()}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--hairline)] disabled:text-[var(--muted)]"
              >
                <Icon name="send" size={15} strokeWidth={2.1} />
              </button>
            ) : (
              <button
                type="button"
                title="发送 (Enter)"
                aria-label="发送 ↑"
                disabled={!canSend}
                onClick={() => void send()}
                className="grid size-[32px] place-items-center rounded-[8px] bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-pressed)] disabled:bg-[var(--hairline)] disabled:text-[var(--muted)]"
              >
                <Icon name="send" size={15} strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>

        <p className="mt-[9px] text-center text-[11px] text-[var(--stone)]" role="status">
          {status ? `${status} · ` : ""}
          DoxAgent 会基于当前知识库作答并标注来源；重要结论建议核对原文
        </p>
      </div>
    </div>
  );
}
