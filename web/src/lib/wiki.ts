export type WikiLink = {
  target: string;
  label: string;
  raw: string;
};

const WIKI_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

function isPlaceholder(target: string): boolean {
  const t = target.trim();
  return !t || t === "..." || /^\.+$/.test(t) || t.includes("...");
}

export function extractWikiLinks(markdown: string): WikiLink[] {
  const out: WikiLink[] = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(WIKI_RE)) {
    const target = match[1]?.trim() ?? "";
    if (isPlaceholder(target)) continue;
    const key = target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      target,
      label: (match[2] || target).trim(),
      raw: match[0],
    });
  }

  return out;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function rewriteWikiLinks(
  markdown: string,
  resolve: (name: string) => { href: string } | undefined,
): string {
  return markdown.replace(WIKI_RE, (_raw, target: string, label?: string) => {
    const name = target.trim();
    const text = (label || name).trim();
    if (isPlaceholder(name)) return text;

    const hit = resolve(name);
    if (hit) return `[${text}](${hit.href})`;
    return `<span class="wiki-missing" title="Страница ещё не создана">${escapeHtml(text)}</span>`;
  });
}
