/** Browser directory entries are read in batches; uploaded relative paths stay inside the library. */
export async function droppedFiles(items: DataTransferItemList, fallback: FileList): Promise<{ file: File; path: string }[]> {
  type Entry = { name: string; isFile: boolean; isDirectory: boolean;
    file: (ok: (file: File) => void, fail: (error: Error) => void) => void;
    createReader: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (error: Error) => void) => void } };
  // Capture entry handles during drop; browsers clear DataTransfer after the handler returns.
  const entries = Array.from(items).map((item) => (item as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.()).filter(Boolean) as Entry[];
  const ordinary = Array.from(fallback);
  const result: { file: File; path: string }[] = [];
  async function visit(entry: Entry, prefix: string) {
    if (entry.name.startsWith(".")) return;
    const path = prefix + entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((ok, fail) => entry.file(ok, fail));
      result.push({ file, path });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const batch = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail));
        if (!batch.length) break;
        for (const child of batch) await visit(child, path + "/");
      }
    }
  }
  for (const entry of entries) await visit(entry, "");
  return entries.length ? result : ordinary.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}
