import { useMemo, useState, type ReactNode } from "react";
import type { DocumentInfo } from "./useDocuments";

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
      if (!child) { child = { name: part, path, children: new Map() }; node.children.set(part, child); }
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
export function DocumentTree({ documents, selectedDocId, onOpen }: {
  documents: DocumentInfo[]; selectedDocId?: string; onOpen: (doc: DocumentInfo) => void;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(documents), [documents]);
  const keyword = filter.trim().toLowerCase();
  const matches = useMemo(() => keyword
    ? documents.filter(doc => `${doc.rel_path ?? doc.title}`.toLowerCase().includes(keyword) || doc.title.toLowerCase().includes(keyword))
    : null, [documents, keyword]);
  function toggle(path: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }
  return <div className="min-h-0 flex-1 overflow-auto">
    <input aria-label="按文件名筛选" placeholder="按文件名筛选…" value={filter}
      onChange={event => setFilter(event.target.value)}
      className="mb-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-teal-600"/>
    {!documents.length && <p className="py-6 text-center text-sm text-stone-500">文献库还没有文档。</p>}
    {matches
      ? <ul className="space-y-1">{matches.map(doc => <li key={doc.doc_id}>
          <button className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100 ${doc.doc_id === selectedDocId ? "bg-stone-100" : ""}`} onClick={() => onOpen(doc)}>
            {doc.title}<StatusMark doc={doc}/>
            <span className="ml-1 text-xs text-stone-400">{doc.rel_path ?? ""}</span>
          </button>
        </li>)}
        {!matches.length && <li className="py-4 text-center text-sm text-stone-500">没有匹配的文档。</li>}
      </ul>
      : <ul className="space-y-0.5 text-sm">{renderNodes(tree, expanded, toggle, selectedDocId, onOpen, 0)}</ul>}
  </div>;
}

function StatusMark({ doc }: { doc: DocumentInfo }) {
  if (!doc.status) return null;
  return <span className={`ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${doc.status === "indexed" ? "bg-teal-600" : "bg-amber-500"}`}
    title={doc.status === "indexed" ? "已建立索引" : doc.status}/>;
}

function renderNodes(node: TreeNode, expanded: Set<string>, toggle: (path: string) => void,
  selectedDocId: string | undefined, onOpen: (doc: DocumentInfo) => void, depth: number): ReactNode[] {
  const items: React.ReactNode[] = [];
  for (const child of node.children.values()) {
    if (child.doc) {
      items.push(<li key={child.path}>
        <button className={`w-full truncate rounded-lg px-2 py-1 text-left hover:bg-stone-100 ${child.doc.doc_id === selectedDocId ? "bg-stone-100" : ""}`}
          style={{ paddingLeft: depth * 12 + 8 }} onClick={() => onOpen(child.doc!)}>
          {child.name}<StatusMark doc={child.doc}/>
        </button>
      </li>);
    } else {
      const open = expanded.has(child.path);
      items.push(<li key={child.path}>
        <button className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left font-medium text-stone-700 hover:bg-stone-100"
          style={{ paddingLeft: depth * 12 + 8 }} aria-expanded={open} onClick={() => toggle(child.path)}>
          <span className="w-3 text-xs text-stone-400">{open ? "▾" : "▸"}</span>
          <span className="truncate">{child.name}</span>
          <span className="text-xs text-stone-400">{countDocs(child)}</span>
        </button>
        {open && renderNodes(child, expanded, toggle, selectedDocId, onOpen, depth + 1)}
      </li>);
    }
  }
  return items;
}
