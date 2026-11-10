import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth";
import {
  UPLOADS_PREFIX, fetchCorpora, fetchCorpusFiles, fetchParseArchive, fetchParseBlocks, fetchParseDocument, fetchParsePage,
  fetchCorpusJob, fetchParseStages, fetchPersonalLibraries, ingestCorpus, parseImageUrl, parsePageImageUrl,
  saveParseCorrection, uploadCorpusFile, uploadPersonalFile,
  type CorpusFile, type CorpusInfo, type CorpusJob, type ParseArchive, type ParseBlock, type ParseBlocks,
  type ParseDocument, type ParsePage, type ParseStages,
} from "../api";
import { Icon } from "./Icons";
import { ReportMarkdown } from "./ReportMarkdown";
import { Button, Pill, Segmented } from "./ui";

/** One entry of the library picker, whichever source it comes from. */
type LibraryOption = { id: string; name: string };

/** Block kinds the reader sees; body text carries no label. MinerU's raw type stays in the tooltip. */
const TYPE_LABEL: Record<string, string> = {
  title: "标题", doc_title: "标题", paragraph_title: "标题",
  image: "图", figure: "图", image_body: "图", table: "表格", table_body: "表格",
  image_caption: "题注", table_caption: "题注", table_footnote: "表注",
  equation: "公式", interline_equation: "公式", list: "列表",
  header: "页眉", footer: "页脚", page_number: "页码", page_footnote: "脚注",
};
const TITLE_TYPES = new Set(["title", "doc_title", "paragraph_title"]);
// Page furniture is drawn by the source page itself; the parsed list hides it unless asked.
const DECORATIVE_TYPES = new Set(["header", "footer", "page_number", "page_footnote"]);

/** Plain words for the stage view's machine states (src/stages.py); anything else is shown as is. */
const STAGE_WORD: Record<string, string> = {
  present: "在", missing: "缺失", cached: "已解析", none: "未解析", current: "最新", stale: "待更新",
  pending: "排队中", failed: "失败", error: "失败",
};
const STAGE_TONE: Record<string, "mint" | "yellow" | "rose" | "gray"> = {
  present: "mint", cached: "mint", current: "mint", none: "gray", pending: "gray",
  stale: "yellow", missing: "rose", failed: "rose", error: "rose",
};

const ZOOMS = [1, 1.25, 1.5, 2, 3];

/** `2020_2024_81930055_朱波峰_题目.pdf` → title + "2020–2024 · 81930055 · 朱波峰"; other names stay whole. */
function describeFile(rel: string) {
  const name = rel.split("/").at(-1) ?? rel;
  const stem = name.replace(/\.pdf$/i, "");
  const match = /^(\d{4})_(\d{4})_([A-Za-z0-9]+)_([^_]+)_(.+)$/.exec(stem);
  if (!match) return { title: stem, meta: "" };
  return { title: match[5], meta: `${match[1]}–${match[2]} · ${match[3]} · ${match[4]}` };
}

/** 资料入库工作台：原文页与解析块逐块对照，点一块就地校对（R10 数据层，2026-11-05 版面重做）。 */
export function IngestWorkbench() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const admin = useAuth().role === "admin";
  const [corpusId, setCorpusId] = useState(search.get("corpus") ?? "");
  const [corpora, setCorpora] = useState<CorpusInfo[]>([]);
  const [mine, setMine] = useState<LibraryOption[]>([]);
  const [files, setFiles] = useState<CorpusFile[]>([]);
  const [filter, setFilter] = useState("");
  const [rel, setRel] = useState(search.get("rel") ?? "");
  // P7 (Owner query 2026-1106 1012): ``?rel=`` opens one file directly. Only the first mount keeps
  // it — the corpus effect below clears the selection on every later library switch.
  const initialRel = useRef(search.get("rel") ?? "");
  const [archive, setArchive] = useState<ParseArchive | null>(null);
  const [page, setPage] = useState(0);
  const [blocks, setBlocks] = useState<ParseBlocks | null>(null);
  const [pageData, setPageData] = useState<ParsePage | null>(null);
  const [stages, setStages] = useState<ParseStages | null>(null);
  const [mode, setMode] = useState<"proof" | "stages">("proof");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // P6 (Owner query 2026-1106 1001): 对齐 is the default view — the right pane places each block at
  // its bbox, so the two panes line up; 排版 keeps the flowing list and 数据 the raw JSON.
  // 排版 is the default: text flows, images keep their captions and nothing overlaps. 对齐 stays
  // one click away for spatial comparison with the source page.
  const [view, setView] = useState<"align" | "read" | "json">("read");
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [jumpTo, setJumpTo] = useState("");
  const [zoom, setZoom] = useState(1);
  const [split, setSplit] = useState(50);
  // R11c #7: an empty block is part of the page and must be visible by default, not hidden behind
  // an unchecked box — the list has to match the page block-for-block.
  const [hideEmpty, setHideEmpty] = useState(false);
  // 2026-1109 1113: the whole file can be read as one scroll; page-by-page remains the editing mode.
  // Whole-file reading is the default; a click on any block opens that page for editing.
  const [reading, setReading] = useState<"paged" | "continuous">("continuous");
  const [showDecorative, setShowDecorative] = useState(false);
  const [pendingJump, setPendingJump] = useState<{ page: number; id: string } | null>(null);
  // R11c #8: a failed read is an error state, not an endless "正在读取".
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  // R11c #4: local undo/redo for the inline editor (at least 20 steps).
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [jobProgress, setJobProgress] = useState<CorpusJob | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [uploadReport, setUploadReport] = useState<{ name: string; indexed: boolean; detail: string }[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);
  const wheelState = useRef({ acc: 0, until: 0 });
  // Scroll sync between the two panes in the 对齐 view; the ref stops the two handlers echoing.
  const syncing = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const boxRefs = useRef(new Map<string, HTMLElement>());
  const rowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let alive = true;
    void fetchCorpora().then((items) => {
      if (!alive) return;
      setCorpora(items);
      if (items.length) setCorpusId((current) => current || items[0].id);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void fetchPersonalLibraries().then((items) => {
      if (alive) setMine(items.map((item) => ({ id: UPLOADS_PREFIX + item.id, name: item.name })));
    }).catch(() => { /* no personal library is a normal state, not an error on this page */ });
    return () => { alive = false; };
  }, []);

  const clearPage = useCallback(() => {
    setBlocks(null); setPageData(null); setSelected(null); setHovered(null); setEditing(null); setDraft("");
    setLoadError(""); setPast([]); setFuture([]);
  }, []);

  // P6d: the page size is cleared when the image really changes — a page or file switch — because
  // then ``onLoad`` fires again with the new dimensions. ``clearPage`` runs on saves and archive
  // refreshes too, where the same image stays; clearing there left a non-A4 page on the A4 fallback.
  useEffect(() => { setPageSize(null); }, [corpusId, rel, page]);

  // A switch clears everything the previous library / file / page filled before any new response arrives.
  useEffect(() => {
    // A deep-linked file survives the first mount; later library switches clear the selection.
    const keep = initialRel.current;
    initialRel.current = "";
    setRel(keep); setArchive(null); setStages(null); setPage(0); clearPage(); setError(""); setNotice(""); setUploadReport([]);
    if (!corpusId) { setFiles([]); return; }
    let alive = true;
    void fetchCorpusFiles(corpusId).then((listing) => { if (alive) setFiles(listing.files); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // The stage view also feeds the per-file parse state in the list.
    void fetchParseStages(corpusId).then((data) => { if (alive) setStages(data); }).catch(() => null);
    return () => { alive = false; };
  }, [corpusId, clearPage]);

  useEffect(() => {
    setArchive(null); setPage(0); clearPage(); setShowDetail(false); setShowImages(false);
    if (!corpusId || !rel) return;
    let alive = true;
    void fetchParseArchive(corpusId, rel).then((data) => { if (alive) setArchive(data); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [corpusId, rel, clearPage]);

  useEffect(() => {
    if (!corpusId || !rel || !archive?.exists) return;
    let alive = true;
    clearPage();
    setLoading(true);
    void Promise.all([
      fetchParseBlocks(corpusId, rel, page).then((body) => ({ body, error: "" }))
        .catch((e: unknown) => ({ body: null, error: e instanceof Error ? e.message : String(e) })),
      fetchParsePage(corpusId, rel, page).then((body) => ({ body, error: "" }))
        .catch((e: unknown) => ({ body: null, error: e instanceof Error ? e.message : String(e) })),
    ]).then(([blockResult, pageResult]) => {
      if (!alive) return;
      setLoading(false);
      setBlocks(blockResult.body);
      setPageData(pageResult.body);
      // R11c #8: a failed block read is reported, and editing stays disabled until a retry succeeds.
      setLoadError(blockResult.error || (blockResult.body ? "" : "这一页的解析块读取失败"));
    });
    return () => { alive = false; };
  }, [corpusId, rel, page, archive, clearPage, reloadToken]);

  // P6c: a new page starts at the top of both panes; carrying the previous page's offset into a
  // different page would line the two panes up against the wrong rows.
  useEffect(() => {
    if (view !== "align") return;
    if (pageScrollRef.current) pageScrollRef.current.scrollTop = 0;
    if (textScrollRef.current) textScrollRef.current.scrollTop = 0;
  }, [page, view]);

  // P6: in the 对齐 view both panes scroll together by proportion. Only scrollTop is mirrored: the
  // wheel-to-page gesture above still decides when a page turns, so a sync never turns a page.
  useEffect(() => {
    if (view !== "align" || !archive?.exists || !blocks) return;
    const left = pageScrollRef.current;
    const right = textScrollRef.current;
    if (!left || !right) return;
    const mirror = (from: HTMLDivElement, to: HTMLDivElement) => () => {
      if (syncing.current) return;
      const fromRange = from.scrollHeight - from.clientHeight;
      const toRange = to.scrollHeight - to.clientHeight;
      if (fromRange <= 0 || toRange <= 0) return;
      syncing.current = true;
      to.scrollTop = (from.scrollTop / fromRange) * toRange;
      // Release on the next frame, after the mirrored scroll event has fired.
      requestAnimationFrame(() => { syncing.current = false; });
    };
    const leftHandler = mirror(left, right);
    const rightHandler = mirror(right, left);
    left.addEventListener("scroll", leftHandler, { passive: true });
    right.addEventListener("scroll", rightHandler, { passive: true });
    return () => {
      left.removeEventListener("scroll", leftHandler);
      right.removeEventListener("scroll", rightHandler);
    };
    // P6d: ``archive?.exists`` and ``blocks?.page`` are stable values that become available only
    // after the async loads, so the handlers bind when the panes actually exist — not once against
    // empty refs. (The block array itself is a fresh object each render; its page is not.)
  }, [view, page, rel, split, archive?.exists, blocks?.page, pageSize]);

  const pdfs = useMemo(() => files.filter((item) => item.rel_path.toLowerCase().endsWith(".pdf")), [files]);
  const personal = corpusId.startsWith(UPLOADS_PREFIX);
  const canWrite = admin || personal;
  const stageByRel = useMemo(() => new Map((stages?.rows ?? []).map((row) => [row.rel_path, row])), [stages]);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? pdfs.filter((item) => item.rel_path.toLowerCase().includes(needle)) : pdfs;
  }, [pdfs, filter]);
  const selectedFile = files.find((item) => item.rel_path === rel);
  const docId = selectedFile?.doc_id ?? "";
  const pages = blocks?.page_count ?? pageData?.pages ?? archive?.pages ?? 0;
  const continuous = useQuery({
    queryKey: ["parse-document", corpusId, rel],
    queryFn: ({ signal }) => fetchParseDocument(corpusId, rel, signal),
    enabled: reading === "continuous" && Boolean(rel) && Boolean(archive?.exists),
    staleTime: 30000,
  });
  const quality = archive?.quality ?? null;
  const correctedByBlock = useMemo(() => pageData?.corrections?.blocks ?? {}, [pageData]);
  const allBlocks = useMemo(() => blocks?.blocks ?? [], [blocks]);
  const emptyCount = allBlocks.filter((block) => block.no_text).length;
  const visible = useMemo(() => allBlocks.filter((block) =>
    (showDecorative || !DECORATIVE_TYPES.has(block.type))
    && !block.attached_to
    && (!hideEmpty || !block.no_text || correctedByBlock[block.id])),
    [allBlocks, hideEmpty, correctedByBlock, showDecorative]);
  // P6: the 对齐 canvas places every block that has a bbox; the rest fall back to a list below it.
  const alignedBlocks = visible.filter((block) => block.bbox);
  const unplaced = visible.filter((block) => !block.bbox);
  const editingBlock = allBlocks.find((item) => item.id === editing);
  const dirty = editing !== null && draft !== (correctedByBlock[editing]?.after ?? editingBlock?.text ?? "");
  const file = describeFile(rel);

  const leaveDraft = (what: string) => !dirty || window.confirm(`这一块还没保存，${what}会丢掉修改。继续？`);

  const jump = (next: number) => {
    if (!pages) return;
    const clamped = Math.min(Math.max(0, next), pages - 1);
    if (clamped === page || !leaveDraft("翻页")) return;
    setPage(clamped);
  };

  // A stable handle for the native wheel listener below (it is bound once per page change).
  const jumpRef = useRef(jump);
  jumpRef.current = jump;

  // Wheel over the source page turns pages: plain wheel = page (only once the page itself cannot
  // scroll further in that direction), Ctrl/⌘ + wheel = zoom. A threshold plus a short cooldown
  // keeps one trackpad gesture from skipping several pages.
  useEffect(() => {
    const boxes = [pageScrollRef.current, textScrollRef.current]
      .filter((box): box is HTMLDivElement => Boolean(box));
    if (!boxes.length) return;
    const handlers = new Map<HTMLDivElement, (event: WheelEvent) => void>();
    for (const box of boxes) {
      const onWheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setZoom((current) => {
            const index = ZOOMS.indexOf(current);
            const step = event.deltaY < 0 ? 1 : -1;
            return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index + step))];
          });
          return;
        }
        if (!pages || pages < 2) return;
        const atTop = box.scrollTop <= 1;
        const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
        const goingUp = event.deltaY < 0;
        // The pane still has somewhere to scroll: leave the gesture to the browser.
        if ((goingUp && !atTop) || (!goingUp && !atBottom)) return;
        event.preventDefault();
        const now = Date.now();
        if (now < wheelState.current.until) return;
        // A reversal starts a fresh gesture instead of inheriting the previous direction's delta.
        if (wheelState.current.acc && Math.sign(wheelState.current.acc) !== Math.sign(event.deltaY)) {
          wheelState.current.acc = 0;
        }
        wheelState.current.acc += event.deltaY;
        if (Math.abs(wheelState.current.acc) < 90) return;
        const direction = wheelState.current.acc > 0 ? 1 : -1;
        wheelState.current.acc = 0;
        wheelState.current.until = now + 320;
        jumpRef.current(page + direction);
      };
      box.addEventListener("wheel", onWheel, { passive: false });
      handlers.set(box, onWheel);
    }
    return () => { for (const [box, handler] of handlers) box.removeEventListener("wheel", handler); };
  }, [pages, page]);

  // A new page starts at its top, whichever control turned it (buttons, keyboard or wheel).
  useEffect(() => {
    pageScrollRef.current?.scrollTo({ top: 0 });
  }, [page, rel]);

  const onPageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      jump(page - 1);
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      jump(page + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      jump(0);
    } else if (event.key === "End") {
      event.preventDefault();
      jump(pages - 1);
    }
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Selecting from one side brings the other side's counterpart into view. */
  const selectBlock = (id: string, from: "page" | "list") => {
    if (editing !== id && !leaveDraft("切换")) return;
    if (editing !== id) { setEditing(null); setDraft(""); }
    setSelected(id);
    const target = (from === "page" ? rowRefs : boxRefs).current.get(id);
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  // A block clicked in continuous reading opens its page and then focuses that block, once the
  // page's blocks have actually arrived (the old page's refs would scroll to the wrong row).
  useEffect(() => {
    if (!pendingJump || !blocks || blocks.page !== pendingJump.page) return;
    if (!blocks.blocks.some((block) => block.id === pendingJump.id)) return;
    selectBlock(pendingJump.id, "list");
    setPendingJump(null);
  }, [pendingJump, blocks]);


  const startEdit = (block: ParseBlock) => {
    if (!canWrite || editing === block.id || loadError) return;
    if (!leaveDraft("切换")) return;
    setSelected(block.id); setEditing(block.id);
    setPast([]); setFuture([]);
    setDraft(correctedByBlock[block.id]?.after ?? block.text);
    boxRefs.current.get(block.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const cancelEdit = () => { setEditing(null); setDraft(""); setPast([]); setFuture([]); };

  const saveBlock = async (block: ParseBlock) => {
    if (!corpusId || !rel || !canWrite || loadError) return;
    const target = { corpusId, rel, page };
    setBusy("正在保存"); setError(""); setNotice("");
    try {
      // ``before`` is the block's own parsed text so the backend can verify it is still that block;
      // the save touches this block only and leaves the parse output alone (decision A: no republish).
      await saveParseCorrection(corpusId, rel, page, block.text, draft, { block_id: block.id, bbox: block.bbox });
      const [freshBlocks, freshPage, freshArchive] = await Promise.all([
        fetchParseBlocks(target.corpusId, target.rel, target.page).catch(() => null),
        fetchParsePage(target.corpusId, target.rel, target.page).catch(() => null),
        fetchParseArchive(target.corpusId, target.rel).catch(() => null),
      ]);
      // Only apply the response if the reader is still on this page.
      if (target.corpusId === corpusId && target.rel === rel && target.page === page) {
        if (freshBlocks) setBlocks(freshBlocks);
        if (freshPage) setPageData(freshPage);
        if (freshArchive) setArchive(freshArchive);
        setEditing(null); setDraft(""); setPast([]); setFuture([]);
        setNotice("已保存这一块的校对，原解析结果保留可对照");
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  /** One edit with history: at most 20 steps back, cleared when the editor opens or saves. */
  const edit = (next: string) => {
    setPast((stack) => [...stack, draft].slice(-20));
    setFuture([]);
    setDraft(next);
  };
  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [draft, ...stack].slice(0, 20));
    setDraft(previous);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setFuture((stack) => stack.slice(1));
    setPast((stack) => [...stack, draft].slice(-20));
    setDraft(next);
  };
  /** Wrap the selection in ``marker`` (B/I/S); with no selection, insert the pair and sit in the middle. */
  const wrapSelection = (marker: string) => {
    const area = editorRef.current;
    if (!area) { edit(draft + marker + marker); return; }
    const start = area.selectionStart ?? draft.length;
    const end = area.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end);
    const next = `${draft.slice(0, start)}${marker}${selected}${marker}${draft.slice(end)}`;
    edit(next);
    const caret = start + marker.length + selected.length;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(selected ? caret + marker.length : caret, selected ? caret + marker.length : caret);
    });
  };

  const editorKeys = (event: KeyboardEvent<HTMLTextAreaElement>, block: ParseBlock) => {
    if (event.key === "Escape") { event.preventDefault(); if (leaveDraft("取消")) cancelEdit(); }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void saveBlock(block); }
    // Ctrl+Z / Ctrl+Shift+Z (and Cmd on macOS) walk the local history (R11c #4).
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
  };

  /** The inline editor of one block (toolbar, textarea, original text). Shared by both views. */
  const renderEditor = (block: ParseBlock) => <div>
    <textarea ref={editorRef} value={draft} autoFocus onChange={(event) => edit(event.target.value)}
      onKeyDown={(event) => editorKeys(event, block)}
      rows={Math.min(14, Math.max(3, Math.ceil(draft.length / 38) + draft.split("\n").length))}
      aria-label="修改这一块的文字"
      className="w-full resize-y rounded-md border border-[var(--primary)] bg-[var(--canvas)] p-[8px] text-body leading-6 text-[var(--heading)] outline-none" />
    <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
      <Button size="sm" variant="ghost" disabled={!past.length} onClick={undo} title="撤销（Ctrl+Z）">撤销</Button>
      <Button size="sm" variant="ghost" disabled={!future.length} onClick={redo} title="重做（Ctrl+Shift+Z）">重做</Button>
      <span className="mx-[4px] h-[16px] w-px bg-[var(--hairline)]" />
      <Button size="sm" variant="ghost" onClick={() => wrapSelection("**")} title="加粗（包裹 **…**）">B</Button>
      <Button size="sm" variant="ghost" onClick={() => wrapSelection("*")} title="斜体（包裹 *…*）">I</Button>
      <Button size="sm" variant="ghost" onClick={() => wrapSelection("~~")} title="删除线（包裹 ~~…~~）">S</Button>
      <span className="mx-[4px] h-[16px] w-px bg-[var(--hairline)]" />
      <Button size="sm" variant="primary" disabled={Boolean(busy) || !dirty} onClick={() => void saveBlock(block)}>保存修改</Button>
      <Button size="sm" variant="ghost" onClick={() => { if (leaveDraft("取消")) cancelEdit(); }}>取消</Button>
      <span className="text-caption text-[var(--text-3)]">Ctrl+Enter 保存 · Esc 取消 · Ctrl+Z 撤销</span>
    </div>
    {block.text && block.text !== draft ? <p className="mt-[6px] text-caption text-[var(--text-3)]">原解析：{block.text}</p> : null}
  </div>;

  /** A block's text/images as the flowing list shows it (no wrapper, no editing chrome). */
  const renderBlockBody = (block: ParseBlock) => {
    const corrected = correctedByBlock[block.id];
    const text = corrected ? corrected.after : block.text;
    return <div role={canWrite ? "button" : undefined} tabIndex={canWrite ? 0 : undefined}
      onClick={() => selectBlock(block.id, "list")}
      onDoubleClick={() => { selectBlock(block.id, "list"); startEdit(block); }}
      onKeyDown={(event) => { if (event.key === "Enter") startEdit(block); }}
      className={canWrite ? "cursor-text" : ""}>
      {view === "json"
        ? <pre className="whitespace-pre-wrap break-all font-code text-caption text-[var(--text-2)]">{JSON.stringify(
          { id: block.id, type: block.type, bbox: block.bbox, text, images: block.images }, null, 1)}</pre>
        : <>
          {block.images?.length ? <div className="mb-[6px] flex flex-wrap gap-[6px]">
            {block.images.map((name) => <img key={name} src={parseImageUrl(corpusId, rel, name)}
              alt={`解析图片 ${name}`} loading="lazy" draggable={false}
              className="max-h-[240px] w-auto max-w-full rounded-sm border border-[var(--hairline)] bg-[var(--canvas)]" />)}
          </div> : null}
          {block.no_text && !corrected
            ? (block.images?.length ? null : <p className="text-body italic text-[var(--text-3)]" title={canWrite ? "双击可补录这一块" : "这一块解析没有文字"}>[NO TEXT]</p>)
            : <div className={`break-words text-pretty ${TITLE_TYPES.has(block.type) ? "font-semibold text-balance text-[var(--heading)]" : ""}`}><ReportMarkdown markdown={text} /></div>}
        </>}
      {corrected?.before && view === "read" ? <p className="mt-[2px] text-caption text-[var(--text-3)] line-through">{corrected.before}</p> : null}
    </div>;
  };

  const refreshLists = async () => {
    const listing = await fetchCorpusFiles(corpusId);
    setFiles(listing.files);
    setStages(await fetchParseStages(corpusId).catch(() => null));
    if (rel) setArchive(await fetchParseArchive(corpusId, rel).catch(() => null));
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!corpusId || !picked.length) return;
    setBusy("正在上传"); setError(""); setNotice(""); setUploadReport([]);
    const report: { name: string; indexed: boolean; detail: string }[] = [];
    try {
      for (const item of picked) {
        if (personal) {
          await uploadPersonalFile(corpusId.slice(UPLOADS_PREFIX.length), item);
          report.push({ name: item.name, indexed: false, detail: "已上传，后台正在解析" });
        } else {
          // The upload response says which file was saved and which one failed to index.
          const result = await uploadCorpusFile(corpusId, item);
          const own = (result.errors ?? []).find((failure) => (failure.source ?? "") === item.name);
          report.push({ name: item.name, indexed: !own, detail: own ? `已保存，入库失败：${own.error}` : "已保存并入库" });
        }
      }
      setUploadReport(report);
      await refreshLists();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  const TERMINAL = new Set(["completed", "done", "failed", "interrupted"]);

  const publish = async () => {
    if (!corpusId) return;
    setBusy("正在入库"); setError(""); setNotice(""); setJobProgress(null);
    try {
      const started = await ingestCorpus(corpusId);
      setJobProgress(started);
      let job = started;
      // R11c #5: an import runs in the background; the button stays busy and the result is reported
      // only when the job reaches a terminal state (2 s apart, at most 60 checks ≈ 2 minutes).
      for (let attempt = 0; attempt < 60 && !TERMINAL.has(job.status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        job = await fetchCorpusJob(corpusId).catch(() => job);
        if (corpusId && rel) setJobProgress(job);
      }
      setNotice(`整库增量入库：${job.status}，新增 ${job.added ?? 0} 份，更新 ${job.updated ?? 0} 份，` +
        `跳过 ${job.skipped ?? 0} 份${job.errors?.length ? `，失败 ${job.errors.length} 份` : ""}`);
      await refreshLists();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); setJobProgress(null); }
  };

  // Draggable divider; the split stays within 28–72 % so both sides remain usable.
  const startDrag = () => {
    const move = (event: PointerEvent) => {
      const box = gridRef.current?.getBoundingClientRect();
      if (!box || box.width < 200) return;
      setSplit(Math.min(72, Math.max(28, ((event.clientX - box.left) / box.width) * 100)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const zoomStep = (direction: 1 | -1) => {
    const index = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index + direction))]);
  };

  // Plain-language findings about this parse; the raw fields live under "解析详情".
  const findings: { tone: "yellow" | "rose"; text: string }[] = [];
  if (archive?.corrections?.invalidated) findings.push({ tone: "rose", text: "原件已更换，之前的校对已作废，需重新解析后再校对" });
  if (archive?.anchors?.missing.length) findings.push({ tone: "yellow",
    text: `${archive.anchors.missing.length} 个关键字段（如批准号、负责人）没在解析文本里找到，建议核对首页` });
  if (quality?.sparse_pages) findings.push({ tone: "yellow", text: `${quality.sparse_pages} 页文字很少，可能是扫描页或图表页` });
  if (quality?.unreadable_chars) findings.push({ tone: "yellow", text: `有 ${quality.unreadable_chars} 个乱码字符` });

  const libraryName = [...corpora.map((item) => ({ id: item.id, name: item.name })), ...mine].find((item) => item.id === corpusId)?.name ?? "";

  return (
    <div className="font-app flex h-full min-h-0 flex-col bg-[var(--surface-soft)] text-[var(--text-2)]">
      {/* 顶栏：一行放下页名、资料库、模式与操作。 */}
      <header className="flex flex-wrap items-center gap-[12px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[20px] py-[10px]">
        <button type="button" onClick={() => void navigate(corpusId && !personal ? `/library/${encodeURIComponent(corpusId)}` : "/library")}
          className="text-body text-[var(--link)] hover:underline">‹ 资料库</button>
        <h1 className="text-group font-semibold text-[var(--heading)]">资料入库</h1>
        <select value={corpusId} aria-label="选择资料库"
          onChange={(event) => { if (leaveDraft("切换资料库")) setCorpusId(event.target.value); }}
          className="max-w-[300px] rounded-md border border-[var(--line-cool-strong)] bg-[var(--canvas)] px-[8px] py-[5px] text-body text-[var(--heading)]">
          <optgroup label="系统资料库">
            {corpora.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup>
          {mine.length ? <optgroup label="我的资料库">
            {mine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup> : null}
        </select>
        <Segmented label="工作台视图" value={mode} onChange={setMode} tabs
          options={[["proof", "逐页校对"], ["stages", "整库状态"]] as const} />
        {mode === "proof" ? <Segmented label="阅读方式" value={reading} onChange={setReading}
          options={[["paged", "分页校对"], ["continuous", "连续阅读"]] as const} /> : null}
        <div className="ml-auto flex items-center gap-[8px]">
          {busy ? <span className="text-caption text-[var(--text-3)]" role="status">{busy}…{jobProgress && jobProgress.total > 0
            ? ` ${jobProgress.completed}/${jobProgress.total}` : ""}</span> : null}
          {canWrite ? <label className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-md border border-[var(--line-cool-strong)] bg-[var(--canvas)] px-[12px] text-body font-medium text-[var(--heading)] transition-colors duration-[var(--dur-quick)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
            <Icon name="upload" size={14} />上传文件
            <input type="file" multiple accept=".pdf,.md,.txt" onChange={(event) => void upload(event)} className="hidden" />
          </label> : null}
          {admin && !personal ? <Button variant="primary" disabled={!corpusId || Boolean(busy)} onClick={() => void publish()}
            title="把资料库目录里新增或变化的文件解析并入库">整库增量入库</Button> : null}
        </div>
      </header>

      {error || notice || uploadReport.length || !canWrite || personal ? (
        <div className="border-b border-[var(--hairline)] bg-[var(--canvas)] px-[20px] py-[6px] text-caption">
          {error ? <p role="alert" className="text-[var(--danger-fg)]">{error}</p> : null}
          {notice ? <p className="text-[var(--ok-fg)]">{notice}</p> : null}
          {uploadReport.map((item) => <p key={item.name}>
            <span className="text-[var(--text-2)]">{item.name}</span>{" · "}
            <span className={item.indexed ? "text-[var(--ok-fg)]" : "text-[var(--warn-fg)]"}>{item.detail}</span>
          </p>)}
          {!canWrite ? <p className="text-[var(--text-3)]">只读：系统资料库的上传与校对仅管理员可操作。</p> : null}
          {personal && canWrite ? <p className="text-[var(--text-3)]">个人资料库上传后由后台自动解析，无需手动入库。</p> : null}
        </div>
      ) : null}

      {mode === "stages" ? <StagesView stages={stages} name={libraryName} onOpen={(path) => { setRel(path); setMode("proof"); }} /> : reading === "continuous" ? (
        <ContinuousReading corpusId={corpusId} rel={rel} title={file.title}
          data={continuous.data} loading={continuous.isLoading} error={continuous.error}
          onJump={(page, id) => { setPage(page); setPendingJump({ page, id }); setReading("paged"); }}
          onRetry={() => void continuous.refetch()} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          {/* 左：资料列表。 */}
          <aside className="flex min-h-0 flex-col border-r border-[var(--hairline)] bg-[var(--canvas)]">
            <div className="flex items-baseline justify-between px-[14px] pt-[12px] pb-[8px]">
              <h2 className="text-body font-semibold text-[var(--heading)]">资料</h2>
              <span className="text-caption text-[var(--text-3)]">{filter ? `${shown.length} / ` : ""}{pdfs.length} 份 PDF</span>
            </div>
            <label className="mx-[12px] mb-[8px] flex items-center gap-[8px] rounded-md border border-[var(--hairline)] px-[10px] py-[6px] text-[var(--text-3)] focus-within:border-[var(--primary)]">
              <Icon name="search" size={14} />
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="项目名、批准号或负责人"
                aria-label="筛选资料" className="w-full border-0 bg-transparent text-body text-[var(--heading)] outline-none placeholder:text-[var(--text-3)]" />
            </label>
            <ul className="min-h-0 flex-1 overflow-auto px-[6px] pb-[10px]">
              {shown.map((item) => {
                const info = describeFile(item.rel_path);
                const stage = stageByRel.get(item.rel_path);
                const parsed = stage ? stage.parse === "cached" : item.status === "indexed";
                const active = rel === item.rel_path;
                return <li key={item.rel_path}>
                  <button type="button" title={item.rel_path} aria-current={active ? "true" : undefined}
                    onClick={() => { if (!active && leaveDraft("切换资料")) setRel(item.rel_path); }}
                    className={`flex w-full gap-[8px] rounded-lg px-[8px] py-[8px] text-left transition-colors duration-[var(--dur-quick)] ${active
                      ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface)]"}`}>
                    <span aria-hidden className={`mt-[7px] size-[6px] shrink-0 rounded-full ${item.status === "error" ? "bg-[var(--danger-fg)]"
                      : parsed ? "bg-[var(--ok-fg)]" : "bg-[var(--line-cool-strong)]"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`line-clamp-2 text-pretty text-body ${active ? "font-semibold text-[var(--heading)]" : "text-[var(--text-2)]"}`}>{info.title}</span>
                      <span className="mt-[2px] block truncate text-caption text-[var(--text-3)]">
                        {info.meta || item.rel_path}{item.status === "error" ? " · 解析失败" : parsed ? "" : " · 未解析"}
                      </span>
                    </span>
                  </button>
                </li>;
              })}
              {!pdfs.length ? <li className="px-[10px] py-[12px] text-caption text-[var(--text-3)]">这个资料库里还没有 PDF。{canWrite ? "用右上角“上传文件”添加。" : ""}</li> : null}
              {pdfs.length && !shown.length ? <li className="px-[10px] py-[12px] text-caption text-[var(--text-3)]">没有匹配“{filter}”的资料。</li> : null}
            </ul>
          </aside>

          {/* 右：当前资料。 */}
          <section className="flex min-h-0 min-w-0 flex-col">
            {!rel ? <EmptyState title="从左侧选一份资料"
              body="左边看原文页，右边是逐块的解析结果；双击任意一块即可就地改正，保存后原解析结果保留可对照。"
              action={pdfs.length ? <Button variant="outline" onClick={() => setRel(pdfs[0].rel_path)}>打开第一份</Button> : null} /> : null}
            {rel && !archive ? <EmptyState title="正在读取…" body="" /> : null}
            {rel && archive && !archive.exists ? <EmptyState title="这份资料还没有解析"
              body={admin && !personal ? "点右上角“整库增量入库”解析新增资料，完成后即可在这里校对。" : "上传后后台会自动解析，完成后即可在这里校对。"} /> : null}

            {rel && archive?.exists ? <>
              {/* 文档头：项目名 + 一句话质量 + 需要注意的问题。 */}
              <div className="border-b border-[var(--hairline)] bg-[var(--canvas)] px-[18px] py-[10px]">
                <div className="flex items-start gap-[12px]">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-emphasis font-semibold text-[var(--heading)]" title={rel}>{file.title}</h2>
                    <p className="mt-[2px] text-caption text-[var(--text-3)]">
                      {[file.meta, quality ? `${quality.pages} 页` : `${archive.pages} 页`,
                        quality ? `正文覆盖 ${Math.round(quality.coverage * 100)}%` : "",
                        archive.corrections?.active ? `已校对 ${archive.corrections.pages.length} 页` : "未校对",
                        archive.quality_grade ? `质量 ${archive.quality_grade} 级` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" icon="info" aria-expanded={showDetail} onClick={() => setShowDetail(!showDetail)}>
                    解析详情
                  </Button>
                </div>
                {findings.length ? <ul className="mt-[6px] flex flex-wrap gap-[6px]">
                  {findings.map((item) => <li key={item.text}><Pill tone={item.tone}>{item.text}</Pill></li>)}
                </ul> : null}
                {showDetail ? <ParseDetail archive={archive} /> : null}
              </div>

              {/* 对照区：两栏各自滚动，填满剩余高度。 */}
              <div ref={gridRef} className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${split}fr 6px ${100 - split}fr` }}>
                <div className="flex min-h-0 min-w-0 flex-col bg-[var(--surface)]">
                  <PaneBar>
                    <span className="text-body font-medium text-[var(--heading)]">原文件</span>
                    <span className="hidden text-caption text-[var(--text-3)] xl:inline"
                      title="鼠标滚轮上下翻页；Ctrl/⌘ + 滚轮缩放">滚轮翻页</span>
                    <div className="ml-auto flex items-center gap-[4px]">
                      <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => jump(page - 1)} aria-label="上一页">‹</Button>
                      <form className="flex items-center gap-[4px] text-caption tabular-nums" onSubmit={(event) => {
                        event.preventDefault();
                        const next = Number(jumpTo);
                        if (Number.isFinite(next) && next >= 1) jump(next - 1);
                        setJumpTo("");
                      }}>
                        <input value={jumpTo} onChange={(event) => setJumpTo(event.target.value.replace(/[^0-9]/g, ""))}
                          inputMode="numeric" aria-label="跳到第几页（回车）" placeholder={String(page + 1)}
                          className="w-[44px] rounded-md border border-[var(--hairline)] px-[6px] py-[2px] text-center text-caption placeholder:text-[var(--heading)]" />
                        <span>/ {pages || "—"}</span>
                      </form>
                      <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => jump(page + 1)} aria-label="下一页">›</Button>
                      <span className="mx-[6px] h-[16px] w-px bg-[var(--hairline)]" />
                      <Button size="sm" variant="ghost" disabled={zoom === ZOOMS[0]} onClick={() => zoomStep(-1)} aria-label="缩小">−</Button>
                      <button type="button" onClick={() => setZoom(1)} title="适应宽度"
                        className="w-[48px] text-center text-caption tabular-nums text-[var(--text-2)] hover:text-[var(--primary)]">
                        {zoom === 1 ? "适应" : `${Math.round(zoom * 100)}%`}
                      </button>
                      <Button size="sm" variant="ghost" disabled={zoom === ZOOMS.at(-1)} onClick={() => zoomStep(1)} aria-label="放大">+</Button>
                      <span className="sr-only" aria-live="polite">第 {page + 1} 页，共 {pages} 页</span>
                    </div>
                  </PaneBar>
                  <div ref={pageScrollRef} tabIndex={0} onKeyDown={onPageKeyDown}
                    aria-label={`原文件第 ${page + 1} 页，共 ${pages} 页；滚轮或方向键翻页`}
                    className="min-h-0 flex-1 overflow-auto p-[12px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]">
                    {docId ? <div className="relative mx-auto bg-[var(--canvas)] shadow-sm" style={{ width: `${zoom * 100}%` }}>
                      <img src={parsePageImageUrl(corpusId, rel, page, Math.min(3, Math.max(1.5, zoom * 1.5)))}
                        alt={`原文件第 ${page + 1} 页`} className="block w-full select-none" draggable={false}
                        onLoad={(event) => {
                          // P6: the right canvas takes the page's own aspect ratio, so both panes agree.
                          const image = event.currentTarget;
                          if (image.naturalWidth && image.naturalHeight) {
                            setPageSize({ w: image.naturalWidth, h: image.naturalHeight });
                          }
                        }} />
                      {visible.filter((block) => block.bbox).map((block) => {
                        const [x0, y0, x1, y1] = block.bbox as number[];
                        const lit = selected === block.id || hovered === block.id;
                        const fixed = Boolean(correctedByBlock[block.id]);
                        return <button key={block.id} type="button" ref={(node) => { if (node) boxRefs.current.set(block.id, node); else boxRefs.current.delete(block.id); }}
                          onClick={() => selectBlock(block.id, "page")}
                          onMouseEnter={() => setHovered(block.id)} onMouseLeave={() => setHovered(null)}
                          aria-label={`定位到解析块：${(block.text || TYPE_LABEL[block.type] || block.type).slice(0, 30)}`}
                          className={`absolute rounded-xs border transition-colors duration-[var(--dur-quick)] ${lit
                            ? "border-2 border-[var(--primary)] bg-[var(--primary)]/8"
                            : fixed ? "border border-[var(--ok-fg)] bg-[var(--ok-fg)]/5"
                            : "border border-[var(--primary)] hover:bg-[var(--primary)]/5"}`}
                          style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`,
                            width: `${Math.max(0.5, (x1 - x0) * 100)}%`, height: `${Math.max(0.5, (y1 - y0) * 100)}%` }} />;
                      })}
                    </div> : <div className="rounded-lg border border-dashed border-[var(--line-cool-strong)] bg-[var(--canvas)] p-[14px]">
                      <p className="text-body text-[var(--text-2)]">这份文件还没有入库，读不到原文页。</p>
                      {pageData?.images.length ? <>
                        <Button className="mt-[8px]" size="sm" variant="ghost" onClick={() => setShowImages(!showImages)}>
                          {showImages ? "收起解析插图" : `查看解析时抽出的插图（${pageData.images.length} 张，非原文页）`}
                        </Button>
                        {showImages ? <div className="mt-[8px] space-y-[8px]">
                          {pageData.images.map((name) => <img key={name} src={parseImageUrl(corpusId, rel, name)}
                            alt={`解析抽出的插图 ${name}`} className="w-full rounded-md border border-[var(--hairline)]" />)}
                        </div> : null}
                      </> : null}
                    </div>}
                  </div>
                </div>

                {/* R11c #14: the divider is reachable by keyboard too: ←/→ move it 2 % per press. */}
                <div role="separator" aria-orientation="vertical" aria-label="调整左右宽度（拖动或方向键）"
                  aria-valuemin={28} aria-valuemax={72} aria-valuenow={Math.round(split)}
                  tabIndex={0} onPointerDown={startDrag}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    const step = event.key === "ArrowLeft" ? -2 : 2;
                    setSplit((current) => Math.min(72, Math.max(28, Math.round(current + step))));
                  }}
                  className="cursor-col-resize border-x border-[var(--hairline)] bg-[var(--line-cool-soft)] transition-colors duration-[var(--dur-quick)] hover:bg-[var(--line-cool-strong)] focus-visible:bg-[var(--line-cool-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--primary)]" />

                <div className="flex min-h-0 min-w-0 flex-col bg-[var(--canvas)]">
                  <PaneBar>
                    <span className="shrink-0 whitespace-nowrap text-body font-medium text-[var(--heading)]">解析结果</span>
                    <span className="shrink-0 whitespace-nowrap text-caption text-[var(--text-3)]">{page + 1}/{pages || "—"} · {visible.length} 段</span>
                    <div className="ml-auto flex items-center gap-[10px]">
                      <label className="flex shrink-0 items-center gap-[3px] whitespace-nowrap text-caption text-[var(--text-3)]" title="页眉、页脚和页码由左侧原件页展示；勾选后在解析结果里也列出">
                        <input type="checkbox" checked={showDecorative} onChange={(event) => setShowDecorative(event.target.checked)} />
                        页眉/页码
                      </label>
                      {emptyCount ? <label className="flex shrink-0 items-center gap-[3px] whitespace-nowrap text-caption text-[var(--text-3)]" title={`隐藏无文字的块（${emptyCount}）`}>
                        <input type="checkbox" checked={hideEmpty} onChange={(event) => setHideEmpty(event.target.checked)} />
                        空块 {emptyCount}
                      </label> : null}
                      <Segmented label="解析结果视图" value={view} onChange={setView}
                        options={[["read", "排版"], ["align", "对齐"], ["json", "数据"]] as const} />
                      {view === "align" ? <span className="hidden text-caption text-[var(--text-3)] 2xl:inline" title="按原文位置排列；窄窗口可横向滚动">按位置</span> : null}
                    </div>
                  </PaneBar>
                  <div ref={textScrollRef} className="min-h-0 flex-1 overflow-auto">
                    {loading ? <p className="p-[16px] text-caption text-[var(--text-3)]">正在读取这一页…</p> : null}
                    {!loading && loadError ? <div role="alert" className="m-[12px] rounded-md border border-[var(--danger-line)] bg-[var(--danger-bg)] p-[12px]">
                      <p className="text-body text-[var(--danger-fg)]">这一页的解析结果读取失败：{loadError}</p>
                      <p className="mt-[4px] text-caption text-[var(--text-3)]">在重新读取成功前不能编辑或保存，避免把校对写到错误的块上。</p>
                      <Button className="mt-[8px]" size="sm" variant="outline"
                        onClick={() => { setLoadError(""); setReloadToken((token) => token + 1); }}>重试</Button>
                    </div> : null}
                    {blocks && !visible.length ? <p className="p-[16px] text-body text-[var(--text-3)]">这一页没有解析出文字。{canWrite && emptyCount ? "空块以 [NO TEXT] 列出，双击它即可补录。" : ""}</p> : null}
                    {/* P6 对齐视图: each block sits at its own bbox on a canvas with the page's aspect
                        ratio, so the right pane lines up with the left page instead of flowing. */}
                    {view === "align" ? <div className="p-[12px]">
                      {/* P6b: a page needs a readable width. Below it the pane scrolls sideways instead of
                          squeezing every block; cqw then resolves against this width, not the pane's. */}
                      <div className="relative mx-auto border border-[var(--hairline)] bg-[var(--canvas)]"
                        style={{ width: "100%", minWidth: "560px", position: "relative",
                          containerType: "inline-size",
                          aspectRatio: pageSize ? `${pageSize.w} / ${pageSize.h}` : "1 / 1.414" }}>
                        {alignedBlocks.map((block, index) => {
                          const [x0, y0, x1, y1] = block.bbox as number[];
                          const corrected = correctedByBlock[block.id];
                          const isEditing = editing === block.id;
                          const active = selected === block.id || hovered === block.id;
                          const title = TITLE_TYPES.has(block.type);
                          return <div key={block.id}
                            ref={(node) => { if (node) rowRefs.current.set(block.id, node); else rowRefs.current.delete(block.id); }}
                            onMouseEnter={() => setHovered(block.id)} onMouseLeave={() => setHovered(null)}
                            // P6c/P6d: the whole bbox is the target — its padding and blank area included,
                            // and it is the one keyboard stop (Tab reaches it; Enter/Space opens the editor).
                            role={isEditing || !canWrite ? undefined : "button"}
                            tabIndex={isEditing || !canWrite ? undefined : 0}
                            onClick={isEditing || !canWrite ? undefined : () => selectBlock(block.id, "list")}
                            onDoubleClick={isEditing || !canWrite ? undefined : () => { selectBlock(block.id, "list"); startEdit(block); }}
                            onKeyDown={isEditing || !canWrite ? undefined : (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectBlock(block.id, "list");
                                startEdit(block);
                              }
                            }}
                            style={{ position: "absolute", left: `${x0 * 100}%`, top: `${y0 * 100}%`,
                              width: `${Math.max(0.5, (x1 - x0) * 100)}%`,
                              minHeight: `${Math.max(0.5, (y1 - y0) * 100)}%`,
                              // An image block is bounded by its own bbox, so a tall figure cannot paint
                              // over the text below it; text blocks still grow to fit their words.
                              height: block.images?.length ? `${Math.max(0.5, (y1 - y0) * 100)}%` : "auto",
                              overflow: "visible",
                              // P6c: the base layer never rises above the active (40) or editing (50) one,
                              // so a page with more than 30 blocks cannot bury its own editor.
                              zIndex: isEditing ? 50 : active ? 40 : Math.min(30, 10 + index),
                              fontSize: title ? "max(14px, 2.1cqw)" : "max(12px, 1.7cqw)",
                              lineHeight: 1.35, padding: "1px 2px",
                              // A title that is a few pixels wider than its bbox used to leave its last
                              // character alone on a second line. Titles keep their words together and may
                              // overflow the bbox; body text still breaks to fit.
                              wordBreak: title ? "keep-all" : "break-word",
                              whiteSpace: title ? "nowrap" : "normal",
                              overflowWrap: title ? "normal" : "anywhere",
                              // P6b: text blocks paint their own background, so a block whose text
                              // outgrows its bbox cannot be read through the neighbour beneath it.
                              // Image blocks stay transparent: the page image is what they show.
                              ...(isEditing ? { background: "var(--surface)" }
                                : block.images?.length ? {}
                                  : { background: "var(--canvas)" }) }}
                            className={`rounded-xs border ${isEditing
                              ? "border-[var(--primary)]"
                              : active ? "border-[var(--primary)] bg-[var(--primary)]/8"
                                : corrected ? "border-[var(--ok-fg)]"
                                  : block.no_text ? "border-dashed border-[var(--line-cool-strong)]"
                                    : "border-transparent hover:border-[var(--primary)] hover:bg-[var(--primary)]/5"}${canWrite && !isEditing ? " cursor-text" : ""}`}>
                            {isEditing ? renderEditor(block)
                              : block.images?.length ? <div style={{ maxWidth: "100%" }}>
                                {block.images.map((name) => <img key={name} src={parseImageUrl(corpusId, rel, name)}
                                  alt={`解析图片 ${name}`} loading="lazy" draggable={false}
                                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />)}
                                {/* P6c: an image block that was proofread still shows the corrected text
                                    under the image — leaving edit mode must not hide it. */}
                                {corrected?.after ? <div className="mt-[2px] break-words">
                                  <ReportMarkdown markdown={corrected.after} /></div>
                                  : block.text ? <div className="mt-[2px] break-words text-[var(--text-2)]"
                                    style={{ fontSize: "max(10px, 1.5cqw)", lineHeight: 1.35 }}>{block.text}</div> : null}
                              </div>
                              : block.no_text && !corrected
                                ? <span className="block w-full text-[var(--text-3)]"
                                  style={{ fontSize: "max(10px, 1.2cqw)", fontStyle: "italic" }}>[NO TEXT]</span>
                                : <div className={`break-words ${title ? "font-semibold text-[var(--heading)]" : ""}`}>
                                  {(corrected ? corrected.after : block.text) ? <ReportMarkdown markdown={corrected ? corrected.after : block.text} />
                                    : <span className="italic text-[var(--text-3)]">[NO TEXT]</span>}
                                </div>}
                          </div>;
                        })}
                      </div>
                      {unplaced.length ? <div className="mt-[12px]">
                        <p className="mb-[4px] text-caption text-[var(--text-3)]">无坐标块（{unplaced.length}）</p>
                        <ol>{unplaced.map((block) => <li key={block.id}
                          className="border-l-2 border-transparent px-[12px] py-[6px] text-caption">
                          {editing === block.id ? renderEditor(block) : renderBlockBody(block)}
                        </li>)}</ol>
                      </div> : null}
                    </div> : <ol>
                      {visible.map((block) => {
                        const corrected = correctedByBlock[block.id];
                        const active = selected === block.id || hovered === block.id;
                        const label = TYPE_LABEL[block.type];
                        const isEditing = editing === block.id;
                        return <li key={block.id} ref={(node) => { if (node) rowRefs.current.set(block.id, node); else rowRefs.current.delete(block.id); }}
                          onMouseEnter={() => setHovered(block.id)} onMouseLeave={() => setHovered(null)}
                          className={`group relative border-l-2 px-[16px] py-[8px] transition-colors duration-[var(--dur-quick)] ${isEditing
                            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                            : active ? "border-[var(--primary)] bg-[var(--surface)]"
                            : corrected ? "border-[var(--ok-fg)]/60" : "border-transparent"}`}>
                          {label || corrected ? <div className="mb-[2px] flex items-center gap-[6px] text-caption text-[var(--text-3)]">
                            {label ? <span title={block.type}>{label}</span> : null}
                            {corrected ? <span className="text-[var(--ok-fg)]">已校对{corrected.by ? ` · ${corrected.by}` : ""}</span> : null}
                          </div> : null}

                          {isEditing ? renderEditor(block) : renderBlockBody(block)}
                          {!isEditing && canWrite ? <span className="pointer-events-none absolute top-[8px] right-[12px] text-caption text-[var(--primary)] opacity-0 transition-opacity duration-[var(--dur-quick)] group-hover:opacity-100">双击修改</span> : null}
                        </li>;
                      })}
                    </ol>}
                  </div>
                </div>
              </div>
            </> : null}
          </section>
        </div>
      )}
    </div>
  );
}

function PaneBar({ children }: { children: ReactNode }) {
  return <div className="flex h-[40px] shrink-0 items-center gap-[8px] overflow-x-auto border-b border-[var(--hairline)] bg-[var(--canvas)] px-[12px]">{children}</div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-[8px] px-[24px] text-center">
    <h2 className="text-group font-semibold text-[var(--heading)]">{title}</h2>
    {body ? <p className="max-w-[44ch] text-body text-[var(--text-3)]">{body}</p> : null}
    {action}
  </div>;
}

/** The parse's raw record, for whoever needs to check how it was produced. */
function ParseDetail({ archive }: { archive: ParseArchive }) {
  const quality = archive.quality;
  const rows: [string, string][] = [
    ["解析方式", archive.profile || "—"],
    ["解析记录", archive.legacy ? "早期解析，未记录解析过程" : "已记录"],
    ["原件页数", quality ? `${quality.pages}${quality.page_count_checked ? "" : "（未能核对）"}` : String(archive.pages)],
    ["有正文的页", quality ? `${quality.pages_with_text} / ${quality.parsed_pages}` : "—"],
    ["字符数", quality ? quality.chars.toLocaleString() : "—"],
    ["文字很少的页", quality ? String(quality.sparse_pages) : "—"],
    ["乱码字符", quality ? String(quality.unreadable_chars) : "—"],
    ["关键字段核对", archive.anchors ? `${archive.anchors.matched} / ${archive.anchors.checked.length} 找到` : "—"],
  ];
  return <div className="mt-[10px] rounded-lg border border-[var(--hairline)] bg-[var(--surface)] p-[12px]">
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-[18px] gap-y-[6px] text-caption">
      {rows.map(([key, value]) => <div key={key} className="flex gap-[8px]">
        <dt className="shrink-0 text-[var(--text-3)]">{key}</dt><dd className="text-[var(--heading)]">{value}</dd>
      </div>)}
    </dl>
    {archive.anchors?.missing.length ? <p className="mt-[8px] text-caption text-[var(--warn-fg)]">
      没找到：{archive.anchors.missing.map((item) => item.anchor).join("、")}</p> : null}
    {archive.attempts.length ? <table className="mt-[10px] w-full text-caption">
      <thead><tr>{["第几次", "档位", "结果", "正文覆盖", "说明"].map((heading) =>
        <th key={heading} className="border-b border-[var(--hairline)] px-[6px] py-[4px] text-left font-medium text-[var(--heading)]">{heading}</th>)}</tr></thead>
      <tbody>{archive.attempts.map((attempt, index) => {
        const row = attempt as Record<string, unknown>;
        return <tr key={index}>
          <td className="px-[6px] py-[4px] tabular-nums">{index + 1}</td>
          <td className="px-[6px] py-[4px]">{String(row.tier ?? "—")}</td>
          <td className="px-[6px] py-[4px]">{row.ok === false ? "失败" : "成功"}</td>
          <td className="px-[6px] py-[4px] tabular-nums">{typeof row.coverage === "number" ? `${Math.round(row.coverage * 100)}%` : "—"}</td>
          <td className="max-w-[320px] px-[6px] py-[4px] text-[var(--text-3)]">{String(row.message ?? row.reason ?? "") || "—"}</td>
        </tr>;
      })}</tbody>
    </table> : null}
  </div>;
}

/**
 * 连续阅读 (2026-1109 1113): the whole file as one scroll, source pages on the left and the parsed
 * text in page order on the right. It is read-only; clicking a block opens that page in 分页校对,
 * where a correction can name the page and block it belongs to.
 */
function ContinuousReading({ corpusId, rel, title, data, loading, error, onJump, onRetry }: {
  corpusId: string; rel: string; title: string; data?: ParseDocument;
  loading: boolean; error: Error | null; onJump: (page: number, id: string) => void; onRetry: () => void;
}) {
  if (loading) return <EmptyState title="正在读取整份解析…" body="" />;
  if (error) return <div className="m-[16px] rounded-lg border border-[var(--danger-line)] bg-[var(--danger-bg)] p-[14px]">
    <p role="alert" className="text-body text-[var(--danger-fg)]">整份解析读取失败：{error.message}</p>
    <Button className="mt-[8px]" size="sm" variant="outline" onClick={onRetry}>重试</Button>
  </div>;
  if (!data) return <EmptyState title="这份资料还没有解析" body="" />;
  return <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
    <div className="min-h-0 overflow-auto border-r border-[var(--hairline)] bg-[var(--surface)] p-[12px]">
      <p className="sticky top-0 z-10 mb-[8px] bg-[var(--surface)] py-[4px] text-caption text-[var(--text-3)]">
        原文件 · {data.page_count} 页 · 连续滚动
      </p>
      {Array.from({ length: data.page_count }, (_, page) => <figure key={page} className="mb-[14px]">
        <img src={parsePageImageUrl(corpusId, rel, page, 1.5)} alt={`原文件第 ${page + 1} 页`}
          loading="lazy" draggable={false}
          className="block w-full rounded-sm border border-[var(--hairline)] bg-[var(--canvas)] shadow-sm" />
        <figcaption className="mt-[4px] text-center text-caption text-[var(--text-3)]">第 {page + 1} 页</figcaption>
      </figure>)}
    </div>
    <div className="min-h-0 overflow-auto bg-[var(--canvas)]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-[8px] border-b border-[var(--hairline)] bg-[var(--canvas)] px-[16px] py-[8px]">
        <span className="min-w-0 flex-1 truncate text-body font-medium text-[var(--heading)]" title={rel}>{title}</span>
        <span className="text-caption text-[var(--text-3)]">连续阅读 · 只读 · 点任意一段进入分页校对</span>
      </div>
      {data.pages.map(({ page, blocks }) => {
        const shown = blocks.filter((block) => !block.attached_to && !DECORATIVE_TYPES.has(block.type));
        if (!shown.length) return null;
        return <section key={page} aria-label={`第 ${page + 1} 页`} className="border-b border-[var(--hairline-soft)] px-[16px] py-[10px]">
          <h3 className="mb-[6px] text-caption font-semibold text-[var(--text-3)]">第 {page + 1} 页</h3>
          <div className="space-y-[4px]">
            {shown.map((block) => {
              const caption = block.caption || (block.images?.length ? block.text : "");
              const empty = !block.text && !block.images?.length;
              return <button key={block.id} type="button" onClick={() => onJump(page, block.id)}
                title="打开这一页的分页校对"
                className={`block w-full rounded-md border border-transparent px-[6px] py-[4px] text-left transition-colors duration-[var(--dur-quick)] hover:border-[var(--primary)] hover:bg-[var(--surface)] ${empty ? "cursor-default opacity-60" : ""}`}>
                {block.images?.length ? <div className="mb-[4px] flex flex-wrap gap-[6px]">
                  {block.images.map((name) => <img key={name} src={parseImageUrl(corpusId, rel, name)}
                    alt={`解析图片 ${name}`} loading="lazy" draggable={false}
                    className="max-h-[260px] w-auto max-w-full rounded-sm border border-[var(--hairline)]" />)}
                </div> : null}
                {caption ? <p className="mb-[3px] text-caption leading-[1.5] text-[var(--text-2)]">{caption}</p> : null}
                {block.text && !block.images?.length ? <div className={`break-words text-pretty ${TITLE_TYPES.has(block.type) ? "font-semibold text-balance text-[var(--heading)]" : ""}`}>
                  <ReportMarkdown markdown={block.text} /></div> : null}
                {empty ? <span className="text-caption italic text-[var(--text-3)]">[NO TEXT]</span> : null}
              </button>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

/** 整库状态：每份资料的原件、解析、检索、提取四个阶段（只读）。 */
function StagesView({ stages, name, onOpen }: { stages: ParseStages | null; name: string; onOpen: (rel: string) => void }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  if (!stages) return <EmptyState title="正在读取整库状态…" body="" />;
  const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");
  // Only PDFs go through layout parsing; a Markdown or text file with no parse record is not a gap.
  const parseOk = (row: ParseStages["rows"][number]) => row.parse === "cached" || (!isPdf(row.rel_path) && row.parse === "none");
  const fine = (row: ParseStages["rows"][number]) => row.source === "present" && parseOk(row) && row.search === "current" && row.extract === "current";
  const ordered = [...stages.rows].sort((a, b) => Number(isPdf(b.rel_path)) - Number(isPdf(a.rel_path)));
  const rows = onlyIssues ? ordered.filter((row) => !fine(row)) : ordered;
  const pdfRows = stages.rows.filter((row) => isPdf(row.rel_path));
  const cell = (value: string, reason?: string) => <span className="inline-flex items-center gap-[4px]" title={reason || value}>
    <Pill tone={STAGE_TONE[value] ?? "gray"}>{STAGE_WORD[value] ?? value}</Pill>
  </span>;
  return <div className="flex min-h-0 flex-1 flex-col bg-[var(--canvas)]">
    <div className="flex flex-wrap items-center gap-[14px] border-b border-[var(--hairline)] px-[20px] py-[10px]">
      <h2 className="text-body font-semibold text-[var(--heading)]">{name} · {stages.documents} 份资料</h2>
      {Object.entries(stages.counts).map(([stage, counts]) => <span key={stage} className="text-caption text-[var(--text-3)]">
        {({ source: "原件", parse: "解析", search: "检索", extract: "提取" } as Record<string, string>)[stage] ?? stage}：
        {stage === "parse" ? `PDF 已解析 ${pdfRows.filter((row) => row.parse === "cached").length} / ${pdfRows.length}`
          : Object.entries(counts).map(([key, value]) => `${STAGE_WORD[key] ?? key} ${value}`).join("，")}
      </span>)}
      <label className="ml-auto flex items-center gap-[4px] text-caption text-[var(--text-2)]">
        <input type="checkbox" checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)} />只看需要处理的
      </label>
    </div>
    <div className="min-h-0 flex-1 overflow-auto px-[20px] pb-[16px]">
      <table className="w-full text-body">
        <thead className="sticky top-0 bg-[var(--canvas)]"><tr>
          {["资料", "原件", "解析", "检索", "提取"].map((heading) =>
            <th key={heading} className="border-b border-[var(--hairline)] px-[8px] py-[8px] text-left text-caption font-medium text-[var(--text-3)]">{heading}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const info = describeFile(row.rel_path);
          const pdf = row.rel_path.toLowerCase().endsWith(".pdf");
          return <tr key={row.rel_path} className="border-b border-[var(--hairline-soft)] hover:bg-[var(--surface)]">
            <td className="max-w-[520px] px-[8px] py-[6px]">
              {pdf ? <button type="button" onClick={() => onOpen(row.rel_path)} className="truncate text-left text-[var(--link)] hover:underline" title={row.rel_path}>{info.title}</button>
                : <span className="truncate" title={row.rel_path}>{info.title}</span>}
              {row.last_error ? <p className="truncate text-caption text-[var(--danger-fg)]" title={row.last_error}>{row.last_error}</p> : null}
            </td>
            <td className="px-[8px] py-[6px]">{cell(row.source)}</td>
            <td className="px-[8px] py-[6px]">{!pdf && row.parse === "none" ? <span className="text-caption text-[var(--text-3)]">不需要</span> : cell(row.parse, row.parse_reason)}</td>
            <td className="px-[8px] py-[6px]">{cell(row.search)}</td>
            <td className="px-[8px] py-[6px]">{cell(row.extract)}</td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length ? <p className="py-[16px] text-body text-[var(--text-3)]">{onlyIssues ? "全部资料四个阶段都正常。" : "这个资料库还没有资料。"}</p> : null}
    </div>
  </div>;
}
