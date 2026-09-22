import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import type { DocumentInfo } from "../useDocuments";

type TreeNode = { name: string; path: string; children: Map<string, TreeNode>; doc?: DocumentInfo };

/** U2.2: build a directory tree from `rel_path` (falling back to the title for legacy payloads). */
function buildTree(documents: DocumentInfo[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const doc of documents) {
    const parts = (doc.rel_path ?? doc.title).split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, index) => {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, children: new Map() };
        node.children.set(part, child);
      }
      if (index === parts.length - 1) child.doc = doc;
      node = child;
    });
  }
  return root;
}

function countDocs(node: TreeNode): number {
  let total = node.doc ? 1 : 0;
  for (const child of node.children.values()) total += countDocs(child);
  return total;
}

/** U2.2: rel_path directory tree with expand/collapse, filename filtering and status marks. */
export function DocumentTree({
  documents,
  selectedDocId,
  onOpen,
}: {
  documents: DocumentInfo[];
  selectedDocId?: string;
  onOpen: (doc: DocumentInfo) => void;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(documents), [documents]);
  const keyword = filter.trim().toLowerCase();
  const matches = useMemo(
    () =>
      keyword
        ? documents.filter(
            (doc) =>
              `${doc.rel_path ?? doc.title}`.toLowerCase().includes(keyword) ||
              doc.title.toLowerCase().includes(keyword),
          )
        : null,
    [documents, keyword],
  );
  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <label className="mb-[12px] flex items-center gap-[8px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[7px] text-[var(--stone)] focus-within:border-[var(--primary)]">
        <Icon name="search" size={14} />
        <input
          aria-label="按文件名筛选"
          placeholder="按文件名筛选…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="font-app w-full border-0 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
        />
      </label>
      {!documents.length ? (
        <p className="py-[24px] text-center text-[13px] text-[var(--steel)]">文献库还没有文档。</p>
      ) : null}
      {matches ? (
        <ul className="space-y-[2px]">
          {matches.map((doc) => (
            <li key={doc.doc_id}>
              <button
                type="button"
                className={`w-full truncate rounded-[6px] px-[8px] py-[7px] text-left text-[13px] transition-colors hover:bg-[var(--surface)] ${
                  doc.doc_id === selectedDocId ? "bg-[var(--surface)] font-medium" : ""
                }`}
                onClick={() => onOpen(doc)}
              >
                {doc.title}
                <StatusMark doc={doc} />
                <span className="ml-1 text-[11px] text-[var(--stone)]">{doc.rel_path ?? ""}</span>
              </button>
            </li>
          ))}
          {!matches.length ? (
            <li className="py-[16px] text-center text-[13px] text-[var(--steel)]">没有匹配的文档。</li>
          ) : null}
        </ul>
      ) : (
        <ul className="space-y-[1px] text-[13px]">
          {renderNodes(tree, expanded, toggle, selectedDocId, onOpen, 0)}
        </ul>
      )}
    </div>
  );
}

function StatusMark({ doc }: { doc: DocumentInfo }) {
  if (!doc.status) return null;
  const indexed = doc.status === "indexed";
  return (
    <span
      className={`ml-2 inline-block size-[6px] rounded-full align-middle`}
      style={{ background: indexed ? "var(--green)" : "#e0a000" }}
      title={indexed ? "已建立索引" : doc.status}
    />
  );
}

function renderNodes(
  node: TreeNode,
  expanded: Set<string>,
  toggle: (path: string) => void,
  selectedDocId: string | undefined,
  onOpen: (doc: DocumentInfo) => void,
  depth: number,
): ReactNode[] {
  const items: ReactNode[] = [];
  for (const child of node.children.values()) {
    if (child.doc) {
      items.push(
        <li key={child.path}>
          <button
            type="button"
            className={`w-full truncate rounded-[6px] px-[8px] py-[6px] text-left transition-colors hover:bg-[var(--surface)] ${
              child.doc.doc_id === selectedDocId ? "bg-[var(--surface)] font-medium" : ""
            }`}
            style={{ paddingLeft: depth * 12 + 8 }}
            onClick={() => onOpen(child.doc!)}
          >
            {child.name}
            <StatusMark doc={child.doc} />
          </button>
        </li>,
      );
    } else {
      const open = expanded.has(child.path);
      items.push(
        <li key={child.path}>
          <button
            type="button"
            className="flex w-full items-center gap-[6px] rounded-[6px] px-[8px] py-[6px] text-left font-medium text-[var(--charcoal)] transition-colors hover:bg-[var(--surface)]"
            style={{ paddingLeft: depth * 12 + 8 }}
            aria-expanded={open}
            onClick={() => toggle(child.path)}
          >
            <Icon
              name="chevronRight"
              size={12}
              strokeWidth={2.2}
              className={`text-[var(--stone)] transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span className="truncate">{child.name}</span>
            <span className="text-[11px] text-[var(--stone)]">{countDocs(child)}</span>
          </button>
          {open ? renderNodes(child, expanded, toggle, selectedDocId, onOpen, depth + 1) : null}
        </li>,
      );
    }
  }
  return items;
}
