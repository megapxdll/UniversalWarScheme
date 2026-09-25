import { marked } from "marked";
import type { LoreEntity, LoreIndex } from "./lore";
import { rewriteWikiLinks } from "./wiki";

marked.setOptions({ gfm: true, breaks: false });

function isMeaningful(body: string): boolean {
  const cleaned = body
    .replace(/^[-*]\s*$/gm, "")
    .replace(/\[\[\.+\]\]/g, "")
    .replace(/\[\[\.\.\.\]\]/g, "")
    .replace(/[-—*–]/g, "")
    .trim();
  return cleaned.length > 0;
}

export function pruneEmptySections(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const parts: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      parts.push({ heading: line, lines: [] });
    } else {
      parts[parts.length - 1]?.lines.push(line);
    }
  }

  const kept: string[] = [];
  for (const part of parts) {
    if (part.heading === null) {
      kept.push(part.lines.join("\n"));
      continue;
    }
    if (!isMeaningful(part.lines.join("\n"))) continue;
    kept.push([part.heading, ...part.lines].join("\n"));
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function dropFirstHeading(markdown: string): string {
  return markdown.replace(/^#{1,3}\s+.+\n+/, "");
}

export function renderEntityHtml(entity: LoreEntity, lore: LoreIndex): string {
  let markdown = dropFirstHeading(entity.body);
  markdown = pruneEmptySections(markdown);
  markdown = rewriteWikiLinks(markdown, (name) => {
    const hit = lore.resolve(name);
    return hit ? { href: hit.href } : undefined;
  });
  return marked.parse(markdown, { async: false }) as string;
}
