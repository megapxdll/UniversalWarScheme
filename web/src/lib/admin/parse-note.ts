import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ENTITY_TYPES, getVaultRoot, type EntityType } from "../lore";
import { extractWikiLinks } from "../wiki";
import { asNames, stripWiki } from "./yaml";
import { CHARACTER_FOLDERS, type CreatePayload, type CharacterFolder } from "./write-note";
import { portraitBasename, portraitPublicUrl } from "./images";

export type ParsedNote = CreatePayload & {
  sourcePath: string;
  portrait: string;
  portraitUrl?: string;
};

function assertVaultFile(rel: string): { abs: string; rel: string } {
  const vault = path.resolve(getVaultRoot());
  const abs = path.resolve(vault, rel);
  const inside = path.relative(vault, abs);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new Error("Путь вне vault");
  }
  if (!fs.existsSync(abs)) throw new Error("Файл не найден");
  return { abs, rel: inside.replaceAll("\\", "/") };
}

function getPath(source: unknown, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

function scalar(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = getPath(data, key);
    if (value == null || value === "" || Array.isArray(value) || typeof value === "object") continue;
    const text = stripWiki(String(value));
    if (text && text !== "[[]]") return text;
  }
  return "";
}

function names(data: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = getPath(data, key);
    const list = asNames(value);
    if (list.length) return list;
  }
  return [];
}

function firstHeading(body: string): string {
  return body.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function section(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  return (body.match(re)?.[1] ?? "").trim();
}

function cleanText(text: string): string {
  return text
    .replace(/^-\s*$/gm, "")
    .replace(/^-\s+/gm, "")
    .replace(/^!\[\[.*?\]\]\s*/gm, "")
    .trim();
}

function labeled(text: string, label: string): string {
  const match = text.match(new RegExp(`^(?:[-*]\\s*)?\\*\\*?${label}:?\\*\\*?\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function joinTexts(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function preamble(body: string): string {
  const index = body.search(/^## /m);
  return cleanText(index >= 0 ? body.slice(0, index) : body);
}

function sectionPrefix(body: string, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)## ${escaped}[^\\n]*\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  return (body.match(re)?.[1] ?? "").trim();
}

function firstFilled(body: string, ...headings: string[]): string {
  for (const heading of headings) {
    const text = cleanText(section(body, heading)) || cleanText(sectionPrefix(body, heading));
    if (text) return text;
  }
  return "";
}

function wikiIn(body: string, heading: string): string[] {
  return extractWikiLinks(section(body, heading)).map((link) => link.target);
}

function uniqueNames(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const name of group) {
      const key = name.trim().toLowerCase();
      if (!name.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push(name.trim());
    }
  }
  return out;
}

function stripLabeled(text: string, labels: string[]): string {
  const skip = new Set(labels.map((label) => label.toLowerCase()));
  return text
    .split("\n")
    .filter((line) => {
      const label = line.match(/^[-*]\s*([^:]+):/)?.[1]?.trim().toLowerCase();
      if (label && skip.has(label)) return false;
      return true;
    })
    .join("\n")
    .replace(/^[-*]\s*$/gm, "")
    .trim();
}

function appearanceNotes(body: string): string {
  const raw = section(body, "Внешность");
  const skip = /^(рост|вес|тип волос|цвет волос|цвет глаз|телосложение|волосы|глаза)$/i;
  return raw
    .split("\n")
    .filter((line) => {
      const label = line.match(/^[-*]\s*([^:]+):/)?.[1]?.trim();
      if (label && skip.test(label)) return false;
      return true;
    })
    .join("\n")
    .replace(/^[-*]\s*$/gm, "")
    .trim();
}

export function parseNote(sourcePath: string): ParsedNote {
  const { abs, rel } = assertVaultFile(sourcePath);
  const parsed = matter(fs.readFileSync(abs, "utf8"));
  const data = parsed.data as Record<string, unknown>;
  const body = parsed.content.replace(/^\s*---\s*/, "").trim();
  const fmType = String(data.type ?? "").toLowerCase().replace("fraction", "faction");
  const folderType: Record<string, EntityType> = {
    "01_Characters": "character",
    "02_Events": "event",
    "03_Periods": "period",
    "04_Locations": "location",
    "05_Factions": "faction",
    "06_Rules": "rule",
  };
  const type = ((ENTITY_TYPES as readonly string[]).includes(fmType) ? fmType : folderType[rel.split("/")[0]]) as
    | EntityType
    | undefined;
  if (!type) throw new Error("Неизвестный тип записи");

  const title =
    type === "character"
      ? firstHeading(body) || path.basename(abs, ".md")
      : scalar(data, "имя", "название", "name") || firstHeading(body) || path.basename(abs, ".md");
  const aliases = asNames(data.aliases);
  const portrait = portraitBasename(scalar(data, "портрет", "portrait", "image")) ||
    portraitBasename(body.match(/!\[\[([^\]|]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]]+)?\]\]/i)?.[1]);
  const pathFolder = rel.split("/")[1];
  const characterFolder =
    type === "character"
      ? ((CHARACTER_FOLDERS.find((folder) => rel.includes(folder)) as CharacterFolder | undefined) ?? pathFolder)
      : undefined;

  const fields: Record<string, unknown> = {};
  if (type === "character") {
    Object.assign(fields, {
      fioRu: scalar(data, "имя", "name"),
      fioEn: scalar(data, "имя_en", "name_en", "english_name"),
      secondName: scalar(data, "второе имя", "second_name"),
      gender: scalar(data, "пол", "gender"),
      age: scalar(data, "возраст", "age"),
      birthDate: scalar(data, "дата рождения", "birth_date"),
      birthplace: names(data, "место рождения", "birthplace")[0] ?? "",
      deathDate: scalar(data, "дата смерти", "death_date"),
      lifeStatus: scalar(data, "жизненный статус", "life_status"),
      faction: names(data, "фракция", "faction"),
      race: scalar(data, "раса", "race"),
      element: scalar(data, "стихия", "element"),
      role: scalar(data, "роль", "role"),
      cycle: scalar(data, "цикл перерождений", "cycle"),
      height: scalar(data, "внешность.рост", "appearance.height"),
      weight: scalar(data, "внешность.вес", "appearance.weight"),
      hairType: scalar(data, "внешность.тип волос", "appearance.hair_type"),
      hairColor: scalar(data, "внешность.цвет волос", "appearance.hair_color"),
      eyeColor: scalar(data, "внешность.цвет глаз", "appearance.eye_color"),
      build: scalar(data, "внешность.телосложение", "appearance.build"),
      lookNotes: appearanceNotes(body),
      abilityType: scalar(data, "боевая статистика.тип способностей", "combat.ability_type"),
      weapon: scalar(data, "боевая статистика.основное оружие", "combat.weapon"),
      fightingStyle: scalar(data, "боевая статистика.боевой стиль", "combat.fighting_style"),
      strength: scalar(data, "боевая статистика.параметры.сила", "combat.stats.strength"),
      speed: scalar(data, "боевая статистика.параметры.скорость", "combat.stats.speed"),
      stamina: scalar(data, "боевая статистика.параметры.выносливость", "combat.stats.stamina"),
      intellect: scalar(data, "боевая статистика.параметры.интеллект", "combat.stats.intellect"),
      overall: scalar(data, "боевая статистика.параметры.общий показатель", "combat.stats.overall"),
      family: names(data, "связи.семья", "relations.family"),
      romance: names(data, "связи.романтика", "relations.romance"),
      friends: names(data, "связи.друзья", "relations.friends"),
      enemies: names(data, "связи.враги", "relations.enemies"),
      partners: names(data, "связи.напарники", "relations.partners"),
      events: uniqueNames(wikiIn(body, "Участие в событиях")),
      character: cleanText(section(body, "Характер")),
      arc: cleanText(section(body, "Арка по периодам")),
      notes: cleanText(section(body, "Заметки")),
      portrait,
      looks: Array.isArray(data.облики) ? data.облики : Array.isArray(data.looks) ? data.looks : [],
    });
  } else if (type === "location") {
    Object.assign(fields, {
      kind: scalar(data, "вид", "kind") || "планета",
      system: scalar(data, "система", "system"),
      population: scalar(data, "популяция", "population"),
      relatedCharacters: uniqueNames(
        names(data, "связанные персонажи", "related_characters"),
        wikiIn(body, "Связанные персонажи"),
      ),
      notes: joinTexts(
        stripLabeled(section(body, "Сводка"), ["название", "вид", "система", "популяция"]),
        cleanText(section(body, "Описание")),
      ),
      capital: cleanText(section(body, "Центральный Вселенский Город")),
      cities: cleanText(section(body, "Список городов")),
    });
  } else if (type === "faction") {
    Object.assign(fields, {
      goal: scalar(data, "цель", "goal") || cleanText(section(body, "Цель")),
      existencePeriod: scalar(data, "период существования", "existence_period") || cleanText(section(body, "Период существования")),
      members: uniqueNames(
        names(data, "участники", "members"),
        wikiIn(body, "Участники"),
        extractWikiLinks(sectionPrefix(body, "Участники")).map((link) => link.target),
      ),
      notes: cleanText(section(body, "Общая информация")),
    });
  } else if (type === "event") {
    const gist = section(body, "Суть события");
    Object.assign(fields, {
      datetime: scalar(data, "дата и время", "date"),
      place: names(data, "место", "location")[0] ?? wikiIn(body, "Где и когда")[0] ?? "",
      period: names(data, "период", "period")[0] ?? "",
      participants: uniqueNames(names(data, "участники", "participants"), wikiIn(body, "Участники")),
      cause: labeled(gist, "Причина"),
      summary: labeled(gist, "Что произошло"),
      aftermath: labeled(gist, "Последствия"),
      whenNotes: stripLabeled(section(body, "Где и когда"), ["имя события", "дата и время", "место", "период"]),
      notes: joinTexts(cleanText(section(body, "Связанные материалы")), cleanText(section(body, "Заметки"))),
    });
  } else if (type === "period") {
    const bounds = section(body, "Границы периода");
    Object.assign(fields, {
      from: labeled(bounds, "От"),
      to: labeled(bounds, "До"),
      range: scalar(data, "range"),
      epoch: scalar(data, "эпоха", "epoch"),
      events: uniqueNames(names(data, "events", "события"), wikiIn(body, "Ключевые события")),
      factions: uniqueNames(
        names(data, "factions", "фракции"),
        wikiIn(body, "Главные силы/фракции"),
      ),
      notes: joinTexts(
        stripLabeled(bounds, ["От", "До"]),
        cleanText(section(body, "Краткое описание эпохи")),
      ),
    });
  } else if (type === "rule") {
    Object.assign(fields, {
      statement: firstFilled(body, "Формулировка правила") || preamble(body),
      how: firstFilled(body, "Как это работает", "Открытые вопросы"),
      limits: firstFilled(body, "Ограничения / цена", "Нестыковки"),
      examples: uniqueNames(wikiIn(body, "Примеры в сюжете")),
      openQuestions: firstFilled(body, "Открытые детали", "Рабочие имена"),
    });
  }

  return {
    type,
    title,
    characterFolder,
    aliases,
    fields,
    sourcePath: rel,
    portrait,
    portraitUrl: portraitPublicUrl(portrait),
  };
}
