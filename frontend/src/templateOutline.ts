/**
 * Turn an uploaded document's text into a report template (query 2026-1014 1737): its chapter
 * headings become `##` sections and sub-headings `###`, and the first short paragraph under a
 * heading is kept as that section's writing guidance. Headings are recognised from Markdown `#`,
 * 第…章/部分/节, 一、 / 1. / 1、 (chapters) and （一） / (1) / 1.1 (sub-sections). Text with no such
 * headings is returned unchanged so nothing is lost; the caller says so.
 */
export type ExtractedTemplate = { content: string; sections: number; extracted: boolean };

const CHAPTER = [/^第[一二三四五六七八九十百\d]+[章部分节篇]\s*\S/, /^[一二三四五六七八九十]+[、.．]\s*\S/, /^\d{1,2}[、.．]\s*(?!\d)\S/];
const SECTION = [/^[（(][一二三四五六七八九十\d]+[）)]\s*\S/, /^\d{1,2}[.．]\d{1,2}(?:[.．]\d{1,2})?\s*\S/];
const MAX_HEADING = 40;

function headingLevel(line: string): 2 | 3 | null {
  const md = /^(#{1,6})\s+\S/.exec(line);
  if (md) return md[1].length <= 2 ? 2 : 3;
  if (line.length > MAX_HEADING || /[。；;！？?!]$/.test(line)) return null;
  if (CHAPTER.some((pattern) => pattern.test(line))) return 2;
  if (SECTION.some((pattern) => pattern.test(line))) return 3;
  return null;
}

export function extractTemplate(text: string, title: string): ExtractedTemplate {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
  const out: string[] = [];
  let sections = 0;
  let guidance = false;  // waiting for the first paragraph under the latest heading
  for (const line of lines) {
    if (!line) continue;
    const level = headingLevel(line);
    if (level) {
      const name = line.replace(/^#{1,6}\s+/, "").trim();
      // A document title repeated as a level-1 heading is not a chapter.
      if (/^#\s/.test(line) && !sections && name === title) continue;
      out.push("", `${"#".repeat(level)} ${name}`);
      sections += 1;
      guidance = true;
    } else if (guidance && sections) {
      out.push("", line.length > 160 ? line.slice(0, 160) + "…" : line);
      guidance = false;
    }
  }
  if (!sections) return { content: text.trim(), sections: 0, extracted: false };
  return { content: [`# ${title}`, "", "上传文件自动提取的章节大纲；可在修改中补充每节的撰写要求。", ...out].join("\n").trim() + "\n", sections, extracted: true };
}
