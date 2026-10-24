import type { AtlasMeasure, YearWindow } from "../../domainAtlas";
import { money } from "../../domains";

export const fmt = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export const cash = (d: AtlasMeasure) =>
  d.funded
    ? d.funding >= 10000
      ? money(d.funding)
      : `${fmt(d.funding)} 万`
    : d.projects
      ? "未记录"
      : "0 万";
export const windowLabel = (w: YearWindow) =>
  w.from === null
    ? "全部立项年份"
    : w.from === w.to
      ? `${w.from} 年立项`
      : `${w.from}—${w.to} 年立项`;
