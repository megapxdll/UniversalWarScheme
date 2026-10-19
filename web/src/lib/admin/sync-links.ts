import fs from "node:fs";
import path from "node:path";
import { getLore, getVaultRoot } from "../lore";
import { wiki } from "./yaml";
import type { CreatePayload } from "./write-note";

function list(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[,;]/)
    .map((part) => part.replaceAll("[", "").replaceAll("]", "").trim())
    .filter(Boolean);
}

function field(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return value == null ? "" : String(value).trim();
}

function findSourceFile(name: string): string | undefined {
  const hit = getLore().resolve(name);
  if (!hit) return undefined;
  return path.join(getVaultRoot(), hit.sourcePath);
}

function alreadyLinked(raw: string, title: string): boolean {
  const link = wiki(title);
  return raw.includes(link);
}

function insertIntoYamlArray(raw: string, key: string, link: string): string {
  const quoted = `"${link}"`;
  const empty = new RegExp(`^(${key}:\\s*)\\[\\s*\\]`, "m");
  if (empty.test(raw)) return raw.replace(empty, `$1[${quoted}]`);

  const filled = new RegExp(`^(${key}:\\s*\\[)(.*)(\\])\\s*$`, "m");
  const match = raw.match(filled);
  if (match && !match[2].includes(link)) {
    const inner = match[2].trim().replace(/,$/, "");
    const next = inner ? `${inner}, ${quoted}` : quoted;
    return raw.replace(filled, `$1${next}$3`);
  }
  return raw;
}

function appendUnderHeading(raw: string, heading: string, line: string): string {
  if (raw.includes(line)) return raw;
  const headingRe = new RegExp(`^(## ${heading}\\s*\\n)`, "m");
  if (!headingRe.test(raw)) {
    return `${raw.trimEnd()}\n\n## ${heading}\n${line}\n`;
  }
  const blockRe = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const block = raw.match(blockRe);
  if (!block) return raw;
  const body = block[1] ?? "";
  if (body.includes(line)) return raw;
  const placeholder = body.trim() === "-" || body.trim() === "- [[ ]]" || body.trim() === "";
  const nextBody = placeholder ? `${line}\n` : `${body.replace(/\s*$/, "")}\n${line}\n`;
  return raw.replace(blockRe, `## ${heading}\n${nextBody}`);
}

function appendUnderLabel(raw: string, label: string, line: string): string {
  const re = new RegExp(`(- ${label}:\\s*\\n)((?:[ \\t]*- .*\\n)*)`);
  const match = raw.match(re);
  if (!match) return raw;
  if (match[0].includes(line)) return raw;
  const existing = match[2] ?? "";
  const onlyEmpty = !existing.trim() || existing.trim() === "-";
  const injected = onlyEmpty ? `  ${line}\n` : `${existing.replace(/\s*$/, "")}\n  ${line}\n`;
  return raw.replace(re, `$1${injected}`);
}

function patchFile(filePath: string, mutate: (raw: string) => string): boolean {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  const after = mutate(before);
  if (after === before) return false;
  fs.writeFileSync(filePath, after, "utf8");
  return true;
}

function linkCharacterIntoNote(targetName: string, newTitle: string, kind: "семья" | "романтика" | "друзья" | "враги" | "напарники"): boolean {
  const file = findSourceFile(targetName);
  if (!file) return false;
  const link = wiki(newTitle);
  const label = kind[0].toUpperCase() + kind.slice(1);
  return patchFile(file, (raw) => {
    let next = insertIntoYamlArray(raw, kind, link);
    next = appendUnderLabel(next, label, `- ${link}`);
    return next;
  });
}

function linkIntoList(targetName: string, newTitle: string, yamlKey: string, heading: string): boolean {
  const file = findSourceFile(targetName);
  if (!file) return false;
  const link = wiki(newTitle);
  return patchFile(file, (raw) => {
    let next = insertIntoYamlArray(raw, yamlKey, link);
    next = appendUnderHeading(next, heading, `- ${link}`);
    return next;
  });
}

export function syncBacklinks(payload: CreatePayload): string[] {
  const title = payload.title.trim();
  const fields = payload.fields;
  const updated: string[] = [];
  const vault = getVaultRoot();
  const track = (file: string | undefined, ok: boolean) => {
    if (ok && file) updated.push(path.relative(vault, file).replaceAll("\\", "/"));
  };

  const tryList = (names: string[], yamlKey: string, heading: string) => {
    for (const name of names) {
      const file = findSourceFile(name);
      track(file, linkIntoList(name, title, yamlKey, heading));
    }
  };

  if (payload.type === "character") {
    const birthplace = field(fields, "birthplace");
    if (birthplace) {
      const file = findSourceFile(birthplace);
      track(file, linkIntoList(birthplace, title, "связанные персонажи", "Связанные персонажи"));
    }
    for (const faction of list(fields.faction)) {
      const file = findSourceFile(faction);
      track(file, linkIntoList(faction, title, "участники", "Участники"));
    }
    for (const name of list(fields.family)) track(findSourceFile(name), linkCharacterIntoNote(name, title, "семья"));
    for (const name of list(fields.romance)) track(findSourceFile(name), linkCharacterIntoNote(name, title, "романтика"));
    for (const name of list(fields.friends)) track(findSourceFile(name), linkCharacterIntoNote(name, title, "друзья"));
    for (const name of list(fields.enemies)) track(findSourceFile(name), linkCharacterIntoNote(name, title, "враги"));
    for (const name of list(fields.partners)) track(findSourceFile(name), linkCharacterIntoNote(name, title, "напарники"));
    for (const name of list(fields.events)) {
      const file = findSourceFile(name);
      track(file, linkIntoList(name, title, "участники", "Участники"));
    }
  }

  if (payload.type === "location") {
    for (const name of list(fields.relatedCharacters)) {
      const file = findSourceFile(name);
      track(
        file,
        patchFile(file ?? "", (raw) => {
          if (alreadyLinked(raw, title)) return raw;
          const link = wiki(title);
          let next = raw.replace(/^(место рождения:\s*)("?\[\[? ?\]\]?"?)?$/m, `$1${dumpQuoted(link)}`);
          if (next === raw) {
            next = raw.replace(/(- Место рождения:\s*).*$/m, `$1${link}`);
          }
          return next;
        }),
      );
    }
  }

  if (payload.type === "faction") {
    for (const name of list(fields.members)) {
      const file = findSourceFile(name);
      const link = wiki(title);
      track(
        file,
        patchFile(file ?? "", (raw) => {
          if (raw.includes(link)) return raw;
          let next = raw.replace(/^(фракция:\s*)(.*)$/m, (_all, key: string, value: string) => {
            const current = value.trim();
            if (!current) return `${key}${dumpQuoted(link)}`;
            if (current.includes(link)) return `${key}${value}`;
            const unquoted = current.replace(/^"|"$/g, "");
            return `${key}${dumpQuoted(`${unquoted}, ${link}`)}`;
          });
          next = next.replace(/(- Фракция:\s*)(.*)$/m, (_all, key: string, value: string) => {
            if (value.includes(link)) return `${key}${value}`;
            const extra = value.trim() ? `${value.trim()}, ${link}` : link;
            return `${key}${extra}`;
          });
          return next;
        }),
      );
    }
  }

  if (payload.type === "event") {
    for (const name of list(fields.participants)) {
      const file = findSourceFile(name);
      track(
        file,
        patchFile(file ?? "", (raw) => appendUnderHeading(raw, "Участие в событиях", `- ${wiki(title)}`)),
      );
    }
    const place = field(fields, "place");
    if (place) {
      const file = findSourceFile(place);
      track(file, appendEventToLocation(file, title));
    }
    const period = field(fields, "period");
    if (period) {
      const file = findSourceFile(period);
      track(file, linkIntoList(period, title, "events", "Ключевые события"));
    }
  }

  if (payload.type === "period") {
    tryList(list(fields.events), "period", "Где и когда");
    for (const name of list(fields.events)) {
      const file = findSourceFile(name);
      const link = wiki(title);
      track(
        file,
        patchFile(file ?? "", (raw) => {
          let next = raw.replace(/^(период:\s*).*$/m, `$1${dumpQuoted(link)}`);
          next = next.replace(/(- Период:\s*).*$/m, `$1${link}`);
          return next;
        }),
      );
    }
    tryList(list(fields.factions), "период существования", "Период существования");
  }

  return [...new Set(updated)];
}

function dumpQuoted(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function appendEventToLocation(file: string | undefined, title: string): boolean {
  if (!file) return false;
  return patchFile(file, (raw) => {
    const line = `- ${wiki(title)}`;
    if (raw.includes(wiki(title))) return raw;
    if (/## Описание/.test(raw)) {
      return raw.replace("## Описание", `## События\n${line}\n\n## Описание`);
    }
    return `${raw.trimEnd()}\n\n## События\n${line}\n`;
  });
}
