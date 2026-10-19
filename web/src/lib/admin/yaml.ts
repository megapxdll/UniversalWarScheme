export function dumpScalar(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/[:#\[\]\{\},'"]/.test(text) || ["true", "false", "null"].includes(text.toLowerCase())) {
    return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }
  return text;
}

export function wiki(name: string): string {
  const trimmed = name.replaceAll("[", "").replaceAll("]", "").trim();
  return trimmed ? `[[${trimmed}]]` : "";
}

export function wikiList(names: string[]): string[] {
  return names.map(wiki).filter(Boolean);
}

export function dumpWikiList(names: string[]): string {
  const items = wikiList(names);
  if (!items.length) return "[]";
  return `[${items.map((item) => dumpScalar(item)).join(", ")}]`;
}

export function dumpWikiLine(names: string[]): string {
  return wikiList(names).join(", ");
}

export function stripWiki(value: string): string {
  return value.replaceAll("[", "").replaceAll("]", "").trim();
}

export function asStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,;]/)
    .map((part) => stripWiki(part))
    .filter(Boolean);
}

export function asNames(value: unknown): string[] {
  return asStringList(value).map(stripWiki).filter(Boolean);
}

export function safeNoteName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
