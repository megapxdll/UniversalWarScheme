import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { sitePath } from "./paths";
import { slugify } from "./slug";
import { inferStoryWorld, type StoryWorld } from "./story-world";
import { extractWikiLinks, type WikiLink } from "./wiki";

export const ENTITY_TYPES = [
  "character",
  "location",
  "faction",
  "rule",
  "event",
  "period",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const COLLECTIONS = {
  characters: {
    type: "character" as const,
    title: "Персонажи",
    singular: "Персонаж",
  },
  locations: {
    type: "location" as const,
    title: "Локации",
    singular: "Локация",
  },
  factions: {
    type: "faction" as const,
    title: "Фракции",
    singular: "Фракция",
  },
  rules: {
    type: "rule" as const,
    title: "Правила мира",
    singular: "Правило",
  },
  events: {
    type: "event" as const,
    title: "События",
    singular: "Событие",
  },
  periods: {
    type: "period" as const,
    title: "Периоды",
    singular: "Период",
  },
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

export const TYPE_LABELS: Record<EntityType, string> = {
  character: "Персонаж",
  location: "Локация",
  faction: "Фракция",
  rule: "Правило",
  event: "Событие",
  period: "Период",
};

const FOLDER_TYPE: Record<string, EntityType> = {
  "01_Characters": "character",
  "02_Events": "event",
  "03_Periods": "period",
  "04_Locations": "location",
  "05_Factions": "faction",
  "06_Rules": "rule",
};

const Frontmatter = z
  .object({
    type: z.string().nullish(),
    status: z.string().nullish(),
    tags: z.union([z.array(z.string()), z.string()]).nullish(),
    aliases: z.array(z.string()).nullish(),
    "birth location": z.string().nullish(),
    birth_location: z.string().nullish(),
    system: z.string().nullish(),
    population: z.union([z.string(), z.number()]).nullish(),
    date: z.union([z.string(), z.number()]).nullish(),
    period: z.string().nullish(),
    location: z.string().nullish(),
    participants: z.array(z.string()).nullish(),
    range: z.string().nullish(),
  })
  .passthrough();

export type PortraitSlide = {
  file: string;
  label: string;
  url: string;
};

export type LoreEntity = {
  id: string;
  slug: string;
  type: EntityType;
  title: string;
  status: "draft" | "published";
  aliases: string[];
  tags: string[];
  sourcePath: string;
  body: string;
  excerpt: string;
  href: string;
  names: string[];
  wikiLinks: WikiLink[];
  portraits: PortraitSlide[];
  story: StoryWorld;
  extra: Record<string, string | undefined>;
};

export type LoreGraphEdge = {
  source: string;
  target: string;
  kind: "wiki" | "meta";
};

export type LoreIndex = {
  entities: LoreEntity[];
  byId: Map<string, LoreEntity>;
  resolve: (name: string) => LoreEntity | undefined;
  incoming: Map<string, LoreEntity[]>;
  edges: LoreGraphEdge[];
};

export function collectionForType(type: EntityType): CollectionKey {
  const found = (Object.entries(COLLECTIONS) as [CollectionKey, (typeof COLLECTIONS)[CollectionKey]][]).find(
    ([, value]) => value.type === type,
  );
  if (!found) throw new Error(`No collection for type ${type}`);
  return found[0];
}

export function isCollectionKey(value: string | undefined): value is CollectionKey {
  return !!value && value in COLLECTIONS;
}

export function getVaultRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "../Universe War History"),
    path.resolve(process.cwd(), "Universe War History"),
    fileURLToPath(new URL("../../../Universe War History", import.meta.url)),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(`Obsidian vault not found. Looked in:\n${candidates.join("\n")}`);
  }
  return found;
}

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;

  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === "99_Templates") continue;
      walkMarkdown(full, acc);
      continue;
    }
    if (name.endsWith(".md") && name.toLowerCase() !== "welcome.md") {
      acc.push(full);
    }
  }

  return acc;
}

function inferType(rel: string, fmType: string | null | undefined): EntityType | null {
  const normalized = (fmType ?? "").trim().toLowerCase();
  if (normalized === "fraction") return "faction";
  if ((ENTITY_TYPES as readonly string[]).includes(normalized)) {
    return normalized as EntityType;
  }
  const top = rel.split(/[\\/]/)[0];
  return FOLDER_TYPE[top] ?? null;
}

function firstHeading(body: string): string | null {
  const match = body.match(/^#{1,3}\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function excerptFrom(body: string): string {
  const text = body
    .replace(/^#.+$/gm, "")
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= 200) return text;
  return `${text.slice(0, 197).trimEnd()}…`;
}

function bulletField(body: string, label: string): string | undefined {
  const match = body.match(new RegExp(`^[-*]\\s*${label}:\\s*(.+)$`, "im"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function hideDrafts(): boolean {
  const flag = process.env.PUBLIC_HIDE_DRAFTS;
  return flag === "1" || flag === "true";
}

function asString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  return String(value);
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function formatMeta(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => String(item).trim())
      .filter((item) => item && item !== "[[]]" && item !== "[[ ]]");
    return parts.length ? parts.join(", ") : undefined;
  }
  if (typeof value === "object") return undefined;
  const text = String(value).trim();
  if (!text || text === "[[]]" || text === "[[ ]]") return undefined;
  return text;
}

function pickFm(data: Record<string, unknown>, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const value = formatMeta(getPath(data, path));
    if (value) return value;
  }
  return undefined;
}

export function canonImageUrl(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const name = filename.replaceAll("\\", "/").split("/").pop()?.trim();
  if (!name) return undefined;
  return sitePath(`/canon-images/${encodeURIComponent(name)}`);
}

function portraitFile(data: Record<string, unknown>, body: string): string | undefined {
  const fromFm = pickFm(data, "портрет", "portrait", "image");
  const raw =
    fromFm?.replace(/^!\[\[/, "").replace(/\]\]$/, "") ||
    body.match(/!\[\[([^\]|]+\.(?:png|jpe?g|webp|gif|avif))(?:\|[^\]]+)?\]\]/i)?.[1];
  const name = raw?.replaceAll("\\", "/").split("/").pop()?.trim();
  return name || undefined;
}

function portraitSlides(data: Record<string, unknown>, body: string, primary?: string): PortraitSlide[] {
  const slides: PortraitSlide[] = [];
  const seen = new Set<string>();
  const add = (file?: string, label?: string) => {
    const name = file?.replace(/^!\[\[/, "").replace(/\]\]$/, "").replaceAll("\\", "/").split("/").pop()?.trim();
    if (!name || !/\.(png|jpe?g|webp|gif|avif)$/i.test(name) || seen.has(name.toLowerCase())) return;
    const url = canonImageUrl(name);
    if (!url) return;
    seen.add(name.toLowerCase());
    slides.push({
      file: name,
      label: (label || name.replace(/\.[^.]+$/, "")).trim(),
      url,
    });
  };

  const raw = data.облики ?? data.looks ?? data.portraits;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") add(item);
      else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        add(String(rec.файл ?? rec.file ?? rec.portrait ?? ""), String(rec.имя ?? rec.name ?? rec.label ?? ""));
      }
    }
  }
  add(primary);
  const oblik = body.match(/## Облик\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "";
  for (const match of oblik.matchAll(/[-*]\s*([^:\n]+):\s*!\[\[([^\]|]+)\]\]/g)) {
    add(match[2], match[1]?.trim());
  }
  return slides;
}

function buildIndex(): LoreIndex {
  const root = getVaultRoot();
  const files = walkMarkdown(root);
  const usedSlugs = new Set<string>();
  const rawEntities: LoreEntity[] = [];

  for (const file of files) {
    const rel = path.relative(root, file);
    const parsed = matter(fs.readFileSync(file, "utf8"));
    const fmResult = Frontmatter.safeParse(parsed.data);
    const fm = fmResult.success ? fmResult.data : (parsed.data as Record<string, unknown>);
    const type = inferType(rel, asString(fm.type));
    if (!type) continue;

    const stem = path.basename(file, ".md");
    const body = parsed.content.replace(/^\s*---\s*/, "").trim();
    const title = firstHeading(body) || stem;
    let slug = slugify(stem) || slugify(title) || "entry";
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i += 1;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);

    const data = fm as Record<string, unknown>;
    const fioRu = pickFm(data, "имя", "name");
    const fioEn = pickFm(data, "имя_en", "name_en", "english_name");
    const secondName = pickFm(data, "второе имя", "second_name");
    const aliases = (Array.isArray(fm.aliases) ? fm.aliases.filter(Boolean) : []).filter(
      (name, index, list): name is string => Boolean(name) && list.indexOf(name) === index,
    );
    const displayTitle = title || fioRu || aliases[0] || fioEn || stem;
    const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [String(fm.tags)] : [];
    const status = String(fm.status ?? "published").toLowerCase() === "draft" ? "draft" : "published";
    const collection = collectionForType(type);
    const names = [displayTitle, title, stem, fioRu, fioEn, secondName, ...aliases]
      .map((name) => String(name).trim())
      .filter(Boolean);
    const portrait = portraitFile(data, body);
    const portraits = portraitSlides(data, body, portrait);
    const sourcePath = rel.replaceAll("\\", "/");
    const extra = {
        role: pickFm(data, "роль", "role") || bulletField(body, "Роль"),
        race: pickFm(data, "раса", "race") || bulletField(body, "Раса"),
        element: pickFm(data, "стихия", "element") || bulletField(body, "Стихия"),
        cycle: pickFm(data, "цикл перерождений", "cycle"),
        fioRu,
        fioEn,
        heroNames: aliases.join(", ") || undefined,
        secondName,
        gender: pickFm(data, "пол", "gender"),
        speciesAge: pickFm(data, "возраст", "age") || bulletField(body, "Возраст/вид") || bulletField(body, "Возраст"),
        birthDate: pickFm(data, "дата рождения", "birth_date"),
        deathDate: pickFm(data, "дата смерти", "death_date"),
        lifeStatus: pickFm(data, "жизненный статус", "life_status"),
        faction: pickFm(data, "фракция", "faction") || bulletField(body, "Фракция"),
        home:
          pickFm(data, "место рождения", "birthplace") ||
          bulletField(body, "Место рождения") ||
          bulletField(body, "Локация базовая") ||
          asString(fm["birth location"]) ||
          asString(fm.birth_location),
        birthLocation:
          pickFm(data, "место рождения", "birthplace") || asString(fm["birth location"]) || asString(fm.birth_location),
        height: pickFm(data, "внешность.рост", "appearance.height"),
        weight: pickFm(data, "внешность.вес", "appearance.weight"),
        hairType: pickFm(data, "внешность.тип волос", "appearance.hair_type"),
        hairColor: pickFm(data, "внешность.цвет волос", "appearance.hair_color"),
        eyeColor: pickFm(data, "внешность.цвет глаз", "appearance.eye_color"),
        build: pickFm(data, "внешность.телосложение", "appearance.build"),
        abilityType: pickFm(data, "боевая статистика.тип способностей", "combat.ability_type"),
        weapon: pickFm(data, "боевая статистика.основное оружие", "combat.weapon"),
        fightingStyle: pickFm(data, "боевая статистика.боевой стиль", "combat.fighting_style"),
        strength: pickFm(data, "боевая статистика.параметры.сила", "combat.stats.strength"),
        speed: pickFm(data, "боевая статистика.параметры.скорость", "combat.stats.speed"),
        stamina: pickFm(data, "боевая статистика.параметры.выносливость", "combat.stats.stamina"),
        intellect: pickFm(data, "боевая статистика.параметры.интеллект", "combat.stats.intellect"),
        overall: pickFm(data, "боевая статистика.параметры.общий показатель", "combat.stats.overall"),
        system: pickFm(data, "система", "system"),
        population: pickFm(data, "популяция", "population") || asString(fm.population),
        kind: pickFm(data, "вид", "location_type", "kind"),
        relatedCharacters: pickFm(data, "связанные персонажи", "related_characters"),
        goal: pickFm(data, "цель", "goal"),
        existencePeriod: pickFm(data, "период существования", "existence_period"),
        eventDate: pickFm(data, "дата и время", "date"),
        eventPlace: pickFm(data, "место", "location"),
        period: pickFm(data, "период", "period"),
        epoch: pickFm(data, "эпоха", "epoch"),
        range: pickFm(data, "range"),
        participants: pickFm(data, "участники", "participants", "members"),
        allies: pickFm(data, "связи.друзья", "relations.friends") || bulletField(body, "Союзники") || bulletField(body, "Друзья"),
        enemies: pickFm(data, "связи.враги", "relations.enemies") || bulletField(body, "Враги"),
        family: pickFm(data, "связи.семья", "relations.family") || bulletField(body, "Семья/близкие") || bulletField(body, "Семья"),
        partners: pickFm(data, "связи.напарники", "relations.partners") || bulletField(body, "Напарники"),
        romance: pickFm(data, "связи.романтика", "relations.romance") || bulletField(body, "Романтика"),
        portrait: portraits[0]?.file || portrait,
        portraitUrl: portraits[0]?.url || canonImageUrl(portrait),
    };

    rawEntities.push({
      id: `${type}:${slug}`,
      slug,
      type,
      title: displayTitle,
      status,
      aliases,
      tags: tags.map(String),
      sourcePath,
      body,
      excerpt: excerptFrom(body),
      href: sitePath(`/${collection}/${slug}`),
      names,
      wikiLinks: extractWikiLinks(body),
      portraits,
      story: inferStoryWorld({
        type,
        sourcePath,
        title: displayTitle,
        explicit: pickFm(data, "история", "story"),
        home: extra.home,
        eventPlace: extra.eventPlace,
        period: extra.period,
        epoch: extra.epoch,
        existencePeriod: extra.existencePeriod,
        kind: extra.kind,
      }),
      extra,
    });
  }

  const lookup = new Map<string, LoreEntity>();
  const byId = new Map<string, LoreEntity>();
  const keyOf = (value: string) => value.trim().toLowerCase();

  for (const entity of rawEntities) {
    byId.set(entity.id, entity);
    for (const name of entity.names) lookup.set(keyOf(name), entity);
  }
  for (const entity of rawEntities) {
    const stem = entity.sourcePath.replaceAll("\\", "/").split("/").pop()?.replace(/\.md$/i, "");
    if (stem) lookup.set(keyOf(stem), entity);
    lookup.set(keyOf(entity.title), entity);
  }

  const resolve = (name: string) => lookup.get(keyOf(name));
  const edgeSet = new Set<string>();
  const allEdges: LoreGraphEdge[] = [];
  const incomingAll = new Map<string, LoreEntity[]>();

  const addEdge = (from: LoreEntity, to: LoreEntity, kind: LoreGraphEdge["kind"]) => {
    if (from.id === to.id) return;
    const key = `${from.id}>${to.id}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    allEdges.push({ source: from.id, target: to.id, kind });
    const list = incomingAll.get(to.id) ?? [];
    if (!list.some((item) => item.id === from.id)) list.push(from);
    incomingAll.set(to.id, list);
  };

  for (const entity of rawEntities) {
    for (const link of entity.wikiLinks) {
      const target = resolve(link.target);
      if (target) addEdge(entity, target, "wiki");
    }

    const metaNames = [
      entity.extra.home,
      entity.extra.birthLocation,
      entity.extra.faction,
      entity.extra.allies,
      entity.extra.enemies,
      entity.extra.family,
      entity.extra.partners,
      entity.extra.romance,
      entity.extra.relatedCharacters,
      entity.extra.participants,
      entity.extra.eventPlace,
      entity.extra.period,
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[,;]/))
      .map((part) => part.replaceAll("[[", "").replaceAll("]]", "").trim())
      .filter(Boolean);

    for (const name of metaNames) {
      const target = resolve(name);
      if (target) addEdge(entity, target, "meta");
    }
  }

  const entities = (hideDrafts() ? rawEntities.filter((entity) => entity.status === "published") : rawEntities).sort(
    (a, b) => a.title.localeCompare(b.title, "ru"),
  );
  const visible = new Set(entities.map((entity) => entity.id));
  const edges = allEdges.filter((edge) => visible.has(edge.source) && visible.has(edge.target));
  const incoming = new Map<string, LoreEntity[]>();
  for (const [id, list] of incomingAll) {
    if (!visible.has(id)) continue;
    incoming.set(
      id,
      list.filter((entity) => visible.has(entity.id)),
    );
  }

  return { entities, byId, resolve, incoming, edges };
}

let cached: LoreIndex | null = null;

export function getLore(): LoreIndex {
  if (!cached || import.meta.env.DEV) {
    cached = buildIndex();
  }
  return cached;
}

export function entitiesOf(type: EntityType): LoreEntity[] {
  return getLore().entities.filter((entity) => entity.type === type);
}

export function cardSubtitle(entity: LoreEntity): string {
  if (entity.type === "character") {
    return [entity.extra.fioRu, entity.extra.fioEn, entity.extra.heroNames, entity.extra.lifeStatus]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join(" · ");
  }
  if (entity.type === "location") {
    return [entity.extra.kind, entity.extra.system, entity.extra.population].filter(Boolean).join(" · ");
  }
  if (entity.type === "faction") {
    return entity.extra.goal || entity.excerpt.slice(0, 140);
  }
  if (entity.type === "event") {
    return [entity.extra.eventDate, entity.extra.period, entity.extra.eventPlace].filter(Boolean).join(" · ");
  }
  return entity.excerpt.slice(0, 140);
}
