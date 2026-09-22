import { useEffect } from "react";
import type { TaskInfo } from "./api";

/** U1.1: single-select task list opened from the new-chat button. */
export function TaskPicker({ tasks, active, error, onPick, onClose }: {
  tasks: TaskInfo[]; active: string; error: string; onPick: (id: string) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div role="radiogroup" aria-label="选择任务" className="mt-2 rounded-xl border border-stone-300 bg-white p-2 text-xs">
    {error && <p role="alert" className="px-1 py-1 text-red-700">{error}</p>}
    {!error && !tasks.length && <p className="px-1 py-1 text-stone-500">正在读取任务…</p>}
    <ul className="space-y-1">
      {tasks.map(task => <li key={task.id}>
        <button type="button" role="radio" aria-checked={task.id === active}
          className={`w-full rounded-lg px-2 py-1.5 text-left ${task.id === active ? "bg-teal-50 text-teal-900" : "hover:bg-stone-100"}`}
          onClick={() => onPick(task.id)}>
          <span className="font-medium">{task.name}</span>
          <span className="mt-0.5 block text-stone-500">{task.description}</span>
        </button></li>)}
    </ul>
    <button type="button" className="mt-2 w-full rounded-lg border border-stone-300 px-2 py-1" onClick={onClose}>取消</button>
  </div>;
}
