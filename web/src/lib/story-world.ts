export const STORY_WORLDS = ["earth", "titania", "universe"] as const;

export type StoryWorld = (typeof STORY_WORLDS)[number];

export const STORIES: Record<
  StoryWorld,
  {
    id: StoryWorld;
    title: string;
    nav: string;
    path: string;
    kicker: string;
    summary: string;
  }
> = {
  earth: {
    id: "earth",
    title: "Земля",
    nav: "Земля",
    path: "/earth",
    kicker: "История Земли",
    summary:
      "Локальная линия Земли: земные персонажи, события на планете и фракции, которые здесь возникли. Если герой Земли позже появляется в чужой войне, это уже связка во вселенную, а не перенос карточки.",
  },
  titania: {
    id: "titania",
    title: "Титания",
    nav: "Титания",
    path: "/titania",
    kicker: "История Титании",
    summary:
      "Локальная линия Титании: академия, титаны, демоны эпохи и события на самой планете. Титанийский персонаж остаётся в этой истории, даже если участвует в земных или вархеймских главах.",
  },
  universe: {
    id: "universe",
    title: "Вселенная",
    nav: "Вселенная",
    path: "/universe",
    kicker: "История мира",
    summary:
      "Общие события и связи между мирами: Вархейм, древние войны, Новый мир и пересечения героев Земли и Титании за пределами их локальных историй.",
  },
};

export function isStoryWorld(value: string | undefined): value is StoryWorld {
  return !!value && (STORY_WORLDS as readonly string[]).includes(value);
}

const EPOCH_ROMAN: [string, number][] = [
  ["xxii", 22],
  ["xxi", 21],
  ["xx", 20],
  ["xix", 19],
  ["xviii", 18],
  ["xvii", 17],
  ["xvi", 16],
  ["xv", 15],
  ["xiv", 14],
  ["xiii", 13],
  ["xii", 12],
  ["xi", 11],
  ["ix", 9],
  ["viii", 8],
  ["vii", 7],
  ["vi", 6],
  ["iv", 4],
  ["iii", 3],
  ["ii", 2],
  ["x", 10],
  ["v", 5],
  ["i", 1],
];

function wikiPlain(value?: string): string {
  return (value ?? "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .toLowerCase()
    .trim();
}

function epochMajor(value?: string): number | undefined {
  if (!value) return undefined;
  const text = value.toLowerCase().replace(/эпоха/g, " ").replace(/[—–-]/g, " ");
  for (const [roman, n] of EPOCH_ROMAN) {
    if (new RegExp(`(?:^|[^a-z])${roman}(?:\\.|$|[^a-z])`).test(text)) return n;
  }
  return undefined;
}

function epochStory(epoch?: number): StoryWorld | undefined {
  if (!epoch) return undefined;
  if ([7, 8, 9, 10, 13, 14, 20, 21, 22].includes(epoch)) return "earth";
  if ([3, 4, 5, 6].includes(epoch)) return "titania";
  if ([1, 2, 11, 12, 15, 16, 17, 18, 19].includes(epoch)) return "universe";
  return undefined;
}

function explicitStory(value?: string): StoryWorld | undefined {
  const text = wikiPlain(value);
  if (!text) return undefined;
  if (text === "earth" || text === "земля" || text.startsWith("история земл")) return "earth";
  if (text === "titania" || text === "титания" || text.startsWith("история титан")) return "titania";
  if (
    text === "universe" ||
    text === "world" ||
    text === "вселенная" ||
    text === "мир" ||
    text.startsWith("история мир") ||
    text.startsWith("история вселен")
  ) {
    return "universe";
  }
  return undefined;
}

function placeStory(value?: string): StoryWorld | undefined {
  const text = wikiPlain(value);
  if (!text) return undefined;
  if (/(вархейм|термарион|арканеум|гур.?баш|к[oö]lg[oö]|т[её]мн\w* пространств)/.test(text)) return "universe";
  if (/(титани|академи|ранаб)/.test(text)) return "titania";
  if (/(земл|нью-йорк|исланд|амазон|планета неро|сверхуглерод)/.test(text)) return "earth";
  return undefined;
}

function folderStory(sourcePath: string): StoryWorld | undefined {
  const path = sourcePath.replaceAll("\\", "/");
  if (path.includes("The Earth Characters")) return "earth";
  if (path.includes("Titania Characters")) return "titania";
  if (path.includes("New World Characters")) return "universe";
  return undefined;
}

function factionStory(title: string, blob: string): StoryWorld | undefined {
  const text = `${title} ${blob}`.toLowerCase();
  if (/(сопротивление земли|защитники земли|теневая организация|культ эпсилон|общество магократов)/.test(text)) {
    return "earth";
  }
  if (/\bнеро\b/.test(text) && !/вархейм|термарион/.test(text)) return "earth";
  if (/боевая академия/.test(text)) return "titania";
  if (/(терракс|ноктеваль|армия разрушителя|спецкоманда|тёмные демоны|темные демоны|архимаг|титаны)/.test(text)) {
    return "universe";
  }
  return placeStory(blob) ?? epochStory(epochMajor(blob));
}

export type StoryHint = {
  type: string;
  sourcePath: string;
  title: string;
  explicit?: string;
  home?: string;
  eventPlace?: string;
  period?: string;
  epoch?: string;
  existencePeriod?: string;
  kind?: string;
};

export function inferStoryWorld(hint: StoryHint): StoryWorld {
  const explicit = explicitStory(hint.explicit);
  if (explicit) return explicit;

  if (hint.type === "character") {
    return folderStory(hint.sourcePath) ?? placeStory(hint.home) ?? "universe";
  }

  if (hint.type === "event") {
    return (
      placeStory(hint.eventPlace) ??
      epochStory(epochMajor(hint.period) ?? epochMajor(hint.epoch) ?? epochMajor(hint.title)) ??
      "universe"
    );
  }

  if (hint.type === "period") {
    return epochStory(epochMajor(hint.epoch) ?? epochMajor(hint.period) ?? epochMajor(hint.title)) ?? "universe";
  }

  if (hint.type === "faction") {
    return (
      factionStory(hint.title, [hint.home, hint.eventPlace, hint.existencePeriod, hint.period, hint.epoch].join(" ")) ??
      "universe"
    );
  }

  if (hint.type === "location") {
    return placeStory(hint.title) ?? placeStory(hint.kind) ?? placeStory(hint.home) ?? "universe";
  }

  return "universe";
}
