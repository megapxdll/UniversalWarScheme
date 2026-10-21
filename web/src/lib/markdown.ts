import { marked } from "marked";
import type { LoreEntity, LoreIndex } from "./lore";
import { sitePath } from "./paths";
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

function dropPortraitEmbed(markdown: string, portrait?: string): string {
  if (!portrait) {
    return markdown.replace(/!\[\[([^\]|]+\.(?:png|jpe?g|webp|gif|avif))(?:\|[^\]]+)?\]\]\s*/gi, "");
  }
  const escaped = portrait.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(new RegExp(`!\\[\\[${escaped}(?:\\|[^\\]]+)?\\]\\]\\s*`, "gi"), "");
}

export function renderEntityHtml(entity: LoreEntity, lore: LoreIndex): string {
  let markdown = dropFirstHeading(entity.body);
  markdown = dropPortraitEmbed(markdown, entity.extra.portrait);
  markdown = markdown.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_all, file: string, alt?: string) => {
      const name = String(file).replaceAll("\\", "/").split("/").pop() ?? "";
      if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return "";
      const src = sitePath(`/canon-images/${encodeURIComponent(name)}`);
      const label = (alt || name.replace(/\.[^.]+$/, "")).trim();
      return `<img src="${src}" alt="${label}" class="lore-portrait" />`;
    },
  );
  markdown = pruneEmptySections(markdown);
  markdown = rewriteWikiLinks(markdown, (name) => {
    const hit = lore.resolve(name);
    return hit ? { href: hit.href } : undefined;
  });
  return marked.parse(markdown, { async: false }) as string;
}
