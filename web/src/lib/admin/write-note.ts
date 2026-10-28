import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getVaultRoot, type EntityType } from "../lore";
import { dumpScalar, dumpWikiLine, dumpWikiList, safeNoteName, wiki } from "./yaml";

export const TYPE_FOLDERS: Record<EntityType, string> = {
  character: "01_Characters",
  event: "02_Events",
  period: "03_Periods",
  location: "04_Locations",
  faction: "05_Factions",
  rule: "06_Rules",
};

export const CHARACTER_FOLDERS = [
  "Titania Characters",
  "The Earth Characters",
  "New World Characters",
] as const;

export const CHARACTER_FOLDER_LABELS: Record<(typeof CHARACTER_FOLDERS)[number], string> = {
  "The Earth Characters": "История Земли",
  "Titania Characters": "История Титании",
  "New World Characters": "История мира",
};

export type CharacterFolder = (typeof CHARACTER_FOLDERS)[number];

export type CreatePayload = {
  type: EntityType;
  title: string;
  characterFolder?: string;
  aliases?: string[];
  fields: Record<string, unknown>;
};

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
  if (value == null) return "";
  return String(value).trim();
}

function mdList(names: string[]): string {
  const items = names.map((name) => wiki(name)).filter(Boolean);
  return items.length ? items.map((item) => `  - ${item}`).join("\n") : "  -";
}

export function resolveNotePath(payload: CreatePayload): string {
  const title = safeNoteName(payload.title);
  if (!title) throw new Error("Нужно имя записи");
  const root = getVaultRoot();
  const typeFolder = TYPE_FOLDERS[payload.type];
  if (payload.type === "character") {
    const sub = payload.characterFolder?.trim() || "New World Characters";
    return path.join(root, typeFolder, sub, `${title}.md`);
  }
  return path.join(root, typeFolder, `${title}.md`);
}

function portraitName(fields: Record<string, unknown>): string {
  return field(fields, "portrait")
    .replace(/^!\[\[/, "")
    .replace(/\]\]$/, "")
    .replaceAll("\\", "/")
    .split("/")
    .pop() ?? "";
}

function looksBlock(fields: Record<string, unknown>, portrait: string): string {
  const raw = fields.looks;
  const items: { file: string; label: string }[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) items.push({ file: item.trim(), label: item.replace(/\.[^.]+$/, "") });
      else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const file = String(rec.файл ?? rec.file ?? "").trim();
        if (file) items.push({ file, label: String(rec.имя ?? rec.name ?? rec.label ?? file.replace(/\.[^.]+$/, "")).trim() });
      }
    }
  }
  if (!items.length && portrait) return "";
  if (portrait && !items.some((item) => item.file === portrait)) {
    items.unshift({ file: portrait, label: "основной" });
  }
  if (!items.length) return "";
  return `облики:\n${items.map((item) => `  - файл: ${item.file}\n    имя: ${dumpScalar(item.label)}`).join("\n")}\n`;
}

function abilitiesYaml(fields: Record<string, unknown>): string {
  const raw = fields.abilities;
  if (!Array.isArray(raw) || !raw.length) return "способности: []\n";
  const lines: string[] = ["способности:"];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = String(rec.name ?? rec.имя ?? "").trim();
    if (!name) continue;
    const kind = String(rec.kind ?? rec.вид ?? "пассивная").trim() || "пассивная";
    const description = String(rec.description ?? rec.описание ?? "").trim();
    lines.push(`  - имя: ${dumpScalar(name)}`);
    lines.push(`    вид: ${dumpScalar(kind)}`);
    lines.push(`    описание: ${dumpScalar(description)}`);
  }
  if (lines.length === 1) return "способности: []\n";
  return `${lines.join("\n")}\n`;
}

function abilitiesMarkdown(fields: Record<string, unknown>): string {
  const raw = fields.abilities;
  if (!Array.isArray(raw) || !raw.length) return "";
  const blocks: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = String(rec.name ?? rec.имя ?? "").trim();
    if (!name) continue;
    const kind = String(rec.kind ?? rec.вид ?? "пассивная").trim() || "пассивная";
    const description = String(rec.description ?? rec.описание ?? "").trim();
    blocks.push(`- **${name}** (${kind})${description ? `: ${description}` : ""}`);
  }
  if (!blocks.length) return "";
  return `\n## Способности\n${blocks.join("\n")}\n`;
}

function characterMarkdown(wikiTitle: string, aliases: string[], fields: Record<string, unknown>): string {
  const family = list(fields.family);
  const romance = list(fields.romance);
  const friends = list(fields.friends);
  const enemies = list(fields.enemies);
  const partners = list(fields.partners);
  const factions = list(fields.faction);
  const events = list(fields.events);
  const birthplace = field(fields, "birthplace");
  const portrait = portraitName(fields);
  const lookNotes = field(fields, "lookNotes");
  const looks = looksBlock(fields, portrait);
  const fioRu = field(fields, "fioRu");
  const fioEn = field(fields, "fioEn");
  const cycle = field(fields, "cycle");
  const birthDate = field(fields, "birthDate");
  const stats = ["strength", "speed", "stamina", "intellect"].map((key) => Number(fields[key]));
  const autoOverall =
    field(fields, "overall") ||
    (stats.every((n) => Number.isFinite(n) && n > 0) ? String(stats.reduce((a, b) => a + b, 0)) : "");
  const cycleYaml = cycle ? `цикл перерождений: ${dumpScalar(cycle)}\n` : "";
  const cycleBullet = cycle ? `- Цикл перерождений: ${cycle}\n` : "";
  const birthYaml = birthDate ? `дата рождения: ${dumpScalar(birthDate)}\n` : "";

  return `---
type: character
status: draft
tags:
  - character
aliases: ${aliases.length ? `[${aliases.map((item) => dumpScalar(item)).join(", ")}]` : "[]"}
портрет: ${dumpScalar(portrait)}
${looks}
имя: ${dumpScalar(fioRu)}
имя_en: ${dumpScalar(fioEn)}
второе имя: ${dumpScalar(field(fields, "secondName"))}
пол: ${dumpScalar(field(fields, "gender"))}
${birthYaml}место рождения: ${dumpScalar(wiki(birthplace))}
фракция: ${dumpScalar(dumpWikiLine(factions))}
раса: ${dumpScalar(field(fields, "race"))}
стихия: ${dumpScalar(field(fields, "element"))}
роль: ${dumpScalar(field(fields, "role"))}
${cycleYaml}
внешность:
  рост: ${dumpScalar(field(fields, "height"))}
  вес: ${dumpScalar(field(fields, "weight"))}
  тип волос: ${dumpScalar(field(fields, "hairType"))}
  цвет волос: ${dumpScalar(field(fields, "hairColor"))}
  цвет глаз: ${dumpScalar(field(fields, "eyeColor"))}
  телосложение: ${dumpScalar(field(fields, "build"))}

боевая статистика:
  тип способностей: ${dumpScalar(field(fields, "abilityType"))}
  основное оружие: ${dumpScalar(field(fields, "weapon"))}
  боевой стиль: ${dumpScalar(field(fields, "fightingStyle"))}
  параметры:
    сила: ${dumpScalar(field(fields, "strength"))}
    скорость: ${dumpScalar(field(fields, "speed"))}
    выносливость: ${dumpScalar(field(fields, "stamina"))}
    интеллект: ${dumpScalar(field(fields, "intellect"))}
    общий показатель: ${dumpScalar(autoOverall)}

${abilitiesYaml(fields)}связи:
  семья: ${dumpWikiList(family)}
  романтика: ${dumpWikiList(romance)}
  друзья: ${dumpWikiList(friends)}
  враги: ${dumpWikiList(enemies)}
  напарники: ${dumpWikiList(partners)}
---

# ${wikiTitle}
${portrait ? `\n![[${portrait}]]\n` : ""}
## Профиль
- ФИО: ${fioRu}
- ФИО (англ.): ${fioEn}
- Наименование: ${aliases.join(", ")}
- Пол: ${field(fields, "gender")}
- Место рождения: ${wiki(birthplace)}
- Фракция: ${dumpWikiLine(factions)}
- Раса: ${field(fields, "race")}
- Стихия: ${field(fields, "element")}
- Роль: ${field(fields, "role")}
${cycleBullet}
## Внешность
- Рост: ${field(fields, "height")}
- Вес: ${field(fields, "weight")}
- Тип волос: ${field(fields, "hairType")}
- Цвет волос: ${field(fields, "hairColor")}
- Цвет глаз: ${field(fields, "eyeColor")}
- Телосложение: ${field(fields, "build")}
${lookNotes ? `\n${lookNotes}\n` : ""}
## Боевая статистика
- Тип способностей: ${field(fields, "abilityType")}
- Основное оружие: ${field(fields, "weapon")}
- Боевой стиль: ${field(fields, "fightingStyle")}
- Сила: ${field(fields, "strength")}
- Скорость: ${field(fields, "speed")}
- Выносливость: ${field(fields, "stamina")}
- Интеллект: ${field(fields, "intellect")}
- Общий показатель: ${autoOverall}
${abilitiesMarkdown(fields)}
## Связи
- Семья:
${mdList(family)}
- Романтика:
${mdList(romance)}
- Друзья:
${mdList(friends)}
- Враги:
${mdList(enemies)}
- Напарники:
${mdList(partners)}

## Характер
${field(fields, "character") || "-"}

## Арка по периодам
${field(fields, "arc") || "-"}

## Участие в событиях
${events.length ? events.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Заметки
${field(fields, "notes") || "-"}
`;
}

function locationMarkdown(title: string, aliases: string[], fields: Record<string, unknown>): string {
  const related = list(fields.relatedCharacters);
  return `---
type: location
status: draft
tags:
  - location
aliases: ${aliases.length ? `[${aliases.map((item) => dumpScalar(item)).join(", ")}]` : "[]"}

название: ${dumpScalar(title)}
вид: ${dumpScalar(field(fields, "kind") || "планета")}
популяция: ${dumpScalar(field(fields, "population"))}
система: ${dumpScalar(field(fields, "system"))}
связанные персонажи: ${dumpWikiList(related)}
---

# ${title}

## Сводка
- Название: ${title}
- Вид: ${field(fields, "kind") || "планета"}
- Система: ${field(fields, "system")}
- Популяция: ${field(fields, "population")}

## Связанные персонажи
${related.length ? related.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Описание
${field(fields, "notes") || "-"}

## Центральный Вселенский Город
${field(fields, "capital") || "-"}

## Список городов
${field(fields, "cities") || "-"}
`;
}

function factionMarkdown(title: string, aliases: string[], fields: Record<string, unknown>): string {
  const members = list(fields.members);
  const portrait = portraitName(fields);
  return `---
type: faction
status: draft
tags:
  - faction
aliases: ${aliases.length ? `[${aliases.map((item) => dumpScalar(item)).join(", ")}]` : "[]"}

имя: ${dumpScalar(title)}
портрет: ${dumpScalar(portrait)}
цель: ${dumpScalar(field(fields, "goal"))}
период существования: ${dumpScalar(field(fields, "existencePeriod"))}
участники: ${dumpWikiList(members)}
---

# ${title}
${portrait ? `\n![[${portrait}]]\n` : ""}
## Общая информация
${field(fields, "notes") || "-"}

## Цель
${field(fields, "goal") || "-"}

## Участники
${members.length ? members.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Период существования
${field(fields, "existencePeriod") || "-"}
`;
}

function eventMarkdown(title: string, aliases: string[], fields: Record<string, unknown>): string {
  const participants = list(fields.participants);
  return `---
type: event
status: draft
tags:
  - event
aliases: ${aliases.length ? `[${aliases.map((item) => dumpScalar(item)).join(", ")}]` : "[]"}

имя: ${dumpScalar(title)}
дата и время: ${dumpScalar(field(fields, "datetime"))}
место: ${dumpScalar(wiki(field(fields, "place")))}
период: ${dumpScalar(wiki(field(fields, "period")))}
участники: ${dumpWikiList(participants)}
---

# ${title}

## Где и когда
- Имя события: ${title}
- Дата и время: ${field(fields, "datetime")}
- Место: ${wiki(field(fields, "place"))}
- Период: ${wiki(field(fields, "period"))}
${field(fields, "whenNotes") ? `${field(fields, "whenNotes")}\n` : ""}

## Участники
${participants.length ? participants.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Суть события
**Причина:** ${field(fields, "cause")}
**Что произошло:** ${field(fields, "summary")}
**Последствия:** ${field(fields, "aftermath")}

## Связанные материалы
${field(fields, "notes") || "-"}
`;
}

function periodMarkdown(title: string, aliases: string[], fields: Record<string, unknown>): string {
  const events = list(fields.events);
  const factions = list(fields.factions);
  return `---
type: period
status: draft
tags:
  - period
aliases: ${aliases.length ? `[${aliases.map((item) => dumpScalar(item)).join(", ")}]` : "[]"}
range: ${dumpScalar(field(fields, "range"))}
эпоха: ${dumpScalar(field(fields, "epoch"))}
---

# ${title}

## Границы периода
- От: ${field(fields, "from")}
- До: ${field(fields, "to")}

## Ключевые события
${events.length ? events.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Главные силы/фракции
${factions.length ? factions.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Краткое описание эпохи
${field(fields, "notes") || "-"}
`;
}

function ruleMarkdown(title: string, fields: Record<string, unknown>): string {
  const examples = list(fields.examples);
  const portrait = portraitName(fields);
  return `---
type: rule
status: draft
tags:
  - rule
портрет: ${dumpScalar(portrait)}
---

# ${title}
${portrait ? `\n![[${portrait}]]\n` : ""}
## Формулировка правила
${field(fields, "statement") || "-"}

## Как это работает
${field(fields, "how") || "-"}

## Ограничения / цена
${field(fields, "limits") || "-"}

## Примеры в сюжете
${examples.length ? examples.map((name) => `- ${wiki(name)}`).join("\n") : "-"}

## Открытые детали
${field(fields, "openQuestions") || "-"}
`;
}

export function renderNote(payload: CreatePayload, wikiTitle?: string): string {
  const title = wikiTitle || safeNoteName(payload.title);
  const aliases = list(payload.aliases);
  switch (payload.type) {
    case "character":
      return characterMarkdown(title, aliases, payload.fields);
    case "location":
      return locationMarkdown(title, aliases, payload.fields);
    case "faction":
      return factionMarkdown(title, aliases, payload.fields);
    case "event":
      return eventMarkdown(title, aliases, payload.fields);
    case "period":
      return periodMarkdown(title, aliases, payload.fields);
    case "rule":
      return ruleMarkdown(title, payload.fields);
    default:
      throw new Error("Неизвестный тип записи");
  }
}

function sameFile(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

export function writeNote(
  payload: CreatePayload,
  options?: { sourcePath?: string },
): { absolutePath: string; relativePath: string } {
  const vault = path.resolve(getVaultRoot());
  const prevPath = options?.sourcePath ? path.resolve(vault, options.sourcePath) : undefined;
  const nextPath = prevPath && fs.existsSync(prevPath) ? prevPath : resolveNotePath(payload);
  const nextRel = path.relative(vault, nextPath);
  if (!nextRel || nextRel.startsWith("..") || path.isAbsolute(nextRel)) {
    throw new Error("Путь вне vault");
  }
  if (prevPath) {
    const inside = path.relative(vault, prevPath);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new Error("Путь вне vault");
    }
  }
  if (fs.existsSync(nextPath) && (!prevPath || !sameFile(nextPath, prevPath))) {
    throw new Error(`Файл уже есть: ${path.relative(vault, nextPath)}`);
  }
  if (payload.type === "character" && prevPath && fs.existsSync(prevPath) && !payload.fields.looks) {
    const parsed = matter(fs.readFileSync(prevPath, "utf8"));
    const looks = (parsed.data as Record<string, unknown>).облики ?? (parsed.data as Record<string, unknown>).looks;
    if (Array.isArray(looks) && looks.length) payload.fields.looks = looks;
  }
  fs.mkdirSync(path.dirname(nextPath), { recursive: true });
  fs.writeFileSync(nextPath, renderNote(payload, path.basename(nextPath, ".md")), "utf8");
  if (prevPath && fs.existsSync(prevPath) && !sameFile(prevPath, nextPath)) {
    fs.unlinkSync(prevPath);
  }
  return {
    absolutePath: nextPath,
    relativePath: path.relative(vault, nextPath).replaceAll("\\", "/"),
  };
}
