import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  ALL_YEARS,
  ANNUAL_METRICS,
  LENSES,
  atlasLayout,
  atlasQuery,
  buildAtlas,
  constrainAtlasView,
  levelMeasure,
  type AnnualMetric,
  type AtlasData,
  type Lens,
} from "../../domainAtlas";
import type { LibraryOverview } from "../../api";
import { LibraryPreviewDrawer } from "../LibraryPreviewDrawer";
import { YearBand } from "./YearBand";
import { LensInspector } from "./LensInspector";
import { DomainPlot } from "./DomainPlot";
import { PanZoomControls } from "./PanZoomControls";
import { usePanZoom } from "./usePanZoom";
import { useAtlasMotion, type LayerMotion } from "./useAtlasMotion";
import "./domain-lens.css";

type Props = {
  libraries: LibraryOverview[];
  reveal?: { id: string; at: number };
};
export function DomainLens(props: Props) {
  const query = useQuery(atlasQuery);
  if (query.isLoading)
    return (
      <p role="status" className="lens-muted">
        正在读取领域项目、批准资助金额与成果记录…
      </p>
    );
  if (query.error || !query.data)
    return (
      <p role="alert" className="lens-error">
        {(query.error as Error)?.message ?? "领域记录暂不可读"}
      </p>
    );
  return <LensMap data={query.data} {...props} />;
}
function LensMap({ data, libraries, reveal }: Props & { data: AtlasData }) {
  const model = useMemo(() => buildAtlas(data), [data]);
  const [search, setSearch] = useSearchParams();
  const requested = search.get("layer");
  const scope =
    requested && model.nodes.get(requested)?.children.length ? requested : null;
  const ids = scope ? model.nodes.get(scope)!.children : model.roots;
  const legacy = search.get("pin");
  const selected = ids.includes(search.get("node") ?? "")
    ? search.get("node")
    : ids.includes(legacy ?? "")
      ? legacy
      : null;
  const params = useRef(search);
  useLayoutEffect(() => {
    params.current = search;
  }, [search]);
  const base =
    selected &&
    ids.includes(search.get("compare") ?? "") &&
    search.get("compare") !== selected
      ? search.get("compare")
      : null;
  const lens: Lens =
    search.get("lens") === "money" || search.get("lens") === "impact"
      ? (search.get("lens") as Lens)
      : "base";
  const from = Number(search.get("from")),
    to = Number(search.get("to"));
  const window =
    data.years.includes(from) && data.years.includes(to) && from <= to
      ? { from, to }
      : ALL_YEARS;
  const metric: AnnualMetric = ANNUAL_METRICS.includes(
    search.get("annual") as AnnualMetric,
  )
    ? (search.get("annual") as AnnualMetric)
    : "projects";
  const expanded = search.get("expanded") === "1";
  const [guide, setGuide] = useState<string | null>(null);
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [open, setOpen] = useState(() => globalThis.innerWidth > 850);
  const [preview, setPreview] = useState<LibraryOverview | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useRef<LayerMotion | null>(null);
  const wrap = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 794, height: 440, font: 16 }),
    [panelHeight, setPanelHeight] = useState(840);
  const clip = useId();
  const rows = useMemo(
    () => ids.map((id) => model.measure(id, window)),
    [ids, model, window.from, window.to],
  );
  const home = useMemo(
    () => atlasLayout(rows, lens, size.width, size.height, size.font),
    [rows, lens, size],
  );
  const pan = usePanZoom(
    svg,
    home,
    `${scope}|${lens}|${window.from}|${window.to}`,
    (v) => constrainAtlasView(home, v),
  );
  const target = useMemo(
    () => atlasLayout(rows, lens, size.width, size.height, size.font, pan.view),
    [rows, lens, size, pan.view],
  );
  const { layout, moving } = useAtlasMotion(
    target,
    `${lens}|${window.from}|${window.to}`,
    scope ?? "root",
    navigation.current,
  );
  const current = selected
    ? model.measure(selected, window)
    : levelMeasure(model, ids, scope, window);
  const kind = rows[0]?.node.kind ?? "domain";
  function update(values: Record<string, string | null>) {
    if (
      "layer" in values ||
      "lens" in values ||
      "from" in values ||
      "to" in values ||
      values.node === null
    )
      setGuide(null);
    setCompareFrom(null);
    const next = new URLSearchParams(params.current);
    next.delete("pin");
    for (const [k, v] of Object.entries(values))
      v === null ? next.delete(k) : next.set(k, v);
    params.current = next;
    setSearch(next, { replace: true });
  }
  useEffect(() => {
    if (!search.has("pin")) return;
    setSearch(
      (old) => {
        const next = new URLSearchParams(old);
        if (selected) next.set("node", selected);
        next.delete("pin");
        return next;
      },
      { replace: true },
    );
  }, [search, selected, setSearch]);
  function anchor(id: string) {
    const p = layout.points.find((p) => p.d.node.id === id);
    return p
      ? { cx: p.cx, cy: p.cy, r: p.r }
      : {
          cx: (home.left + home.right) / 2,
          cy: (home.top + home.bottom) / 2,
          r: 8,
        };
  }
  function enter(id: string, chosen: string | null = null) {
    const node = model.nodes.get(id);
    if (!node?.children.length) return;
    navigation.current = { kind: "enter", anchor: anchor(id) };
    update({ layer: id, node: chosen, compare: null });
    setOpen(true);
  }
  function choose(id: string) {
    if (!ids.includes(id)) return;
    setOpen(true);
    if (compareFrom) {
      if (compareFrom !== id) update({ compare: compareFrom, node: id });
      return;
    }
    if (params.current.get("node") === id) {
      enter(id);
      return;
    }
    update({ node: id, compare: null });
  }
  function returned(name: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(`已返回 ${name}`);
    noticeTimer.current = setTimeout(() => setNotice(""), 1500);
  }
  function navigateTo(
    layer: string | null,
    source = params.current.get("layer"),
  ) {
    if (source === layer) return;
    let parent = source;
    while (parent && model.nodes.get(parent)?.parent !== layer)
      parent = model.nodes.get(parent)?.parent ?? null;
    const destinationRows = (
      layer ? model.nodes.get(layer)!.children : model.roots
    ).map((id) => model.measure(id, window));
    const destination = atlasLayout(
      destinationRows,
      lens,
      size.width,
      size.height,
      size.font,
    );
    const p = destination.points.find((p) => p.d.node.id === parent);
    navigation.current = {
      kind: "back",
      anchor: p ? { cx: p.cx, cy: p.cy, r: p.r } : anchor(scope ?? ""),
    };
    update({ layer, node: parent, compare: null });
    setOpen(true);
    returned(layer ? model.nodes.get(layer)!.name : "全部领域");
  }
  function back() {
    if (compareFrom) {
      setCompareFrom(null);
      return;
    }
    if (params.current.get("compare")) {
      update({ compare: null });
      return;
    }
    if (params.current.get("node")) {
      update({ node: null });
      return;
    }
    const currentLayer = params.current.get("layer");
    if (currentLayer)
      navigateTo(model.nodes.get(currentLayer)?.parent ?? null, currentLayer);
  }
  function selectRow(id: string) {
    const node = model.nodes.get(id);
    if (!node) return;
    if (ids.includes(id)) choose(id);
    else if (node.parent) enter(node.parent, id);
  }
  const lastReveal = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      reveal &&
      reveal.at !== lastReveal.current &&
      model.nodes.has(reveal.id)
    ) {
      lastReveal.current = reveal.at;
      update({ layer: null, node: reveal.id, compare: null });
      setOpen(true);
    }
  }, [reveal]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        !(e.target as Element).closest(".domain-lens") &&
        e.target !== document.body
      )
        return;
      if (
        preview ||
        (e.target as Element).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [preview, selected, base, scope, compareFrom, moving]);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const el = wrap.current,
      main = stage.current;
    if (!el || !main) return;
    function read() {
      const font =
        parseFloat(getComputedStyle(el!).getPropertyValue("--text-emphasis")) ||
        16;
      const box = main!.getBoundingClientRect(),
        plot = el!.getBoundingClientRect(),
        matrix = main!.querySelector(".lens-matrix");
      const header = plot.top - box.top,
        footer =
          box.bottom -
          plot.bottom -
          (matrix?.getBoundingClientRect().height ?? 0);
      const available =
        main!.closest("main")?.clientHeight ?? globalThis.innerHeight - 60;
      const next = {
        width: Math.max(660, Math.floor(plot.width)),
        height: Math.round(
          Math.max(414, Math.min(1000, available - header - footer)),
        ),
        font,
      };
      setSize((old) =>
        old.width === next.width &&
        old.height === next.height &&
        old.font === next.font
          ? old
          : next,
      );
      const height = Math.ceil(
        box.height - (matrix?.getBoundingClientRect().height ?? 0),
      );
      const viewport = main!.closest("main");
      const viewportBox = viewport?.getBoundingClientRect();
      const limit = Math.max(
        200,
        (viewportBox?.bottom ?? globalThis.innerHeight) -
          Math.max(box.top, viewportBox?.top ?? 0) -
          12,
      );
      const panel = Math.min(Math.max(440, height), limit);
      setPanelHeight((old) => (Math.abs(old - panel) < 1 ? old : panel));
    }
    const viewport = main.closest("main");
    const scrolled = () => {
      read();
      setGuide(null);
    };
    viewport?.addEventListener("scroll", scrolled, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(el);
    observer.observe(main);
    if (viewport) observer.observe(viewport);
    globalThis.addEventListener("resize", read);
    read();
    return () => {
      viewport?.removeEventListener("scroll", scrolled);
      observer.disconnect();
      globalThis.removeEventListener("resize", read);
    };
  }, []);
  const path: string[] = [];
  let parent = scope ? model.nodes.get(scope) : undefined;
  while (parent) {
    path.unshift(parent.id);
    parent = parent.parent ? model.nodes.get(parent.parent) : undefined;
  }
  const peers = scope
    ? model.nodes.get(scope)!.parent
      ? model.nodes.get(model.nodes.get(scope)!.parent!)!.children
      : model.roots
    : [];
  function switchLayer(id: string) {
    navigation.current = {
      kind: "enter",
      anchor: {
        cx: (home.left + home.right) / 2,
        cy: (home.top + home.bottom) / 2,
        r: 8,
      },
    };
    update({ layer: id, node: null, compare: null });
  }
  function showLibrary() {
    const domain = current.node.domain;
    const row = libraries.find((r) => r.corpus_id === domain);
    if (row) setPreview(row);
  }
  return (
    <div
      className="domain-lens"
      data-testid="domain-lens"
      data-layer={scope ?? ""}
      data-moving={moving}
      style={{ "--lens-stage-height": `${panelHeight}px` } as CSSProperties}
    >
      <div className="lens-main" ref={stage}>
        <div className="lens-top">
          <div className="lens-views">
            {(Object.keys(LENSES) as Lens[]).map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={lens === k}
                onClick={() =>
                  update({
                    lens: k,
                    annual: {
                      base: "projects",
                      money: "funding",
                      impact: "outputs",
                    }[k],
                  })
                }
              >
                {LENSES[k].name}
              </button>
            ))}
          </div>
          <PanZoomControls map={pan} className="lens-zoom" />
        </div>
        <nav className="lens-crumbs" aria-label="当前分析层级">
          {scope ? (
            <a
              href="?"
              onClick={(e) => {
                e.preventDefault();
                navigateTo(null);
              }}
            >
              全部领域
            </a>
          ) : (
            <b>全部领域</b>
          )}
          {path.map((id) => (
            <span key={id}>
              {" "}
              ›{" "}
              {id === scope ? (
                <select
                  aria-label="切换当前层"
                  value={scope}
                  onChange={(e) => switchLayer(e.target.value)}
                >
                  {peers.map((peer) => (
                    <option
                      key={peer}
                      value={peer}
                      disabled={!model.nodes.get(peer)!.children.length}
                    >
                      {model.nodes.get(peer)!.name}
                    </option>
                  ))}
                </select>
              ) : (
                <a
                  href="?"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(id);
                  }}
                >
                  {model.nodes.get(id)!.name}
                </a>
              )}
            </span>
          ))}
          {notice ? (
            <span className="lens-return-notice" role="status">
              {notice}
            </span>
          ) : null}
        </nav>
        <DomainPlot
          layout={layout}
          home={home}
          lens={lens}
          size={size}
          svg={svg}
          wrap={wrap}
          clip={clip}
          selected={selected}
          baseline={base}
          guide={guide}
          moving={moving}
          onHover={setGuide}
          onSelect={choose}
          onBlank={back}
          pan={pan}
        />
        <p className="lens-gesture-hint">点圆选中 · 再点进入 · 点空白返回</p>
        {layout.missing.some((p) => p.d.projects) ? (
          <div className="lens-insufficient">
            数据不足：
            {layout.missing
              .filter((p) => p.d.projects)
              .map((p) => (
                <span key={p.d.node.id} title={p.value.reason}>
                  ◌ {p.d.node.name}
                </span>
              ))}
          </div>
        ) : null}
        <YearBand
          model={model}
          ids={ids}
          scope={scope}
          years={data.years}
          window={window}
          metric={metric}
          expanded={expanded}
          chosen={selected}
          baseline={base}
          onWindow={(w) =>
            update({
              from: w.from === null ? null : String(w.from),
              to: w.to === null ? null : String(w.to),
            })
          }
          onMetric={(m) => update({ annual: m })}
          onExpanded={(value) => update({ expanded: value ? "1" : null })}
          onFix={selectRow}
          onYearFix={(id, year) =>
            update({ node: id, from: String(year), to: String(year) })
          }
        />
      </div>
      <LensInspector
        model={model}
        d={current}
        selected={selected}
        base={base}
        window={window}
        lens={lens}
        kind={kind}
        medians={home}
        open={open}
        onClose={() => setOpen(false)}
        onCompare={() => {
          if (selected) setCompareFrom(selected);
        }}
        comparePending={!!compareFrom}
        onSelectRow={selectRow}
        showLibrary={showLibrary}
      />
      <LibraryPreviewDrawer
        row={preview}
        onClose={() => setPreview(null)}
        research={preview ? model.measure(preview.corpus_id) : undefined}
      />
    </div>
  );
}
