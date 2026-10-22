import { entitiesOf, getLore, type LoreEntity } from "./lore";
import { extractWikiLinks } from "./wiki";

const ROMAN: [string, number][] = [
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

export function epochSortKey(value: string | undefined): number {
  if (!value) return 9000;
  const text = value.toLowerCase().replace(/эпоха/g, " ").replace(/[—–-]/g, " ");
  for (const [roman, n] of ROMAN) {
    const match = text.match(new RegExp(`(?:^|[^a-z])${roman}(?:\\.(\\d+))?(?:$|[^a-z])`));
    if (match) return n * 10 + (match[1] ? Number(match[1]) : 0);
  }
  return 9000;
}

function wikiName(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .split("|")[0]
    ?.trim() ?? "";
}

export type ChronologyEvent = {
  entity: LoreEntity;
  orderInPeriod: number;
};

export type ChronologyEra = {
  period: LoreEntity;
  events: ChronologyEvent[];
};

export function getChronology(): { eras: ChronologyEra[]; unplaced: LoreEntity[] } {
  const lore = getLore();
  const periods = entitiesOf("period")
    .slice()
    .sort(
      (a, b) =>
        epochSortKey(a.extra.epoch || a.extra.range || a.title) -
          epochSortKey(b.extra.epoch || b.extra.range || b.title) || a.title.localeCompare(b.title, "ru"),
    );
  const events = entitiesOf("event");
  const used = new Set<string>();

  const eras: ChronologyEra[] = periods.map((period) => {
    const listedBlock = period.body.match(/## Ключевые события\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "";
    const listed = extractWikiLinks(listedBlock).map((link) => link.target);
    const bucket: ChronologyEvent[] = [];
    listed.forEach((name, index) => {
      const hit = lore.resolve(name);
      if (hit?.type !== "event" || used.has(hit.id)) return;
      used.add(hit.id);
      bucket.push({ entity: hit, orderInPeriod: index });
    });
    events
      .filter((event) => {
        if (used.has(event.id)) return false;
        const named = wikiName(event.extra.period);
        if (!named) return false;
        const resolved = lore.resolve(named);
        return resolved?.id === period.id || named === period.title;
      })
      .forEach((event) => {
        used.add(event.id);
        bucket.push({ entity: event, orderInPeriod: bucket.length });
      });
    return { period, events: bucket };
  });

  return {
    eras,
    unplaced: events.filter((event) => !used.has(event.id)),
  };
}

export function sortEntitiesForCollection(entities: LoreEntity[]): LoreEntity[] {
  if (!entities.length) return entities;
  if (entities[0]?.type === "period") {
    return entities
      .slice()
      .sort(
        (a, b) =>
          epochSortKey(a.extra.epoch || a.extra.range || a.title) -
            epochSortKey(b.extra.epoch || b.extra.range || b.title) || a.title.localeCompare(b.title, "ru"),
      );
  }
  if (entities[0]?.type === "event") {
    const { eras, unplaced } = getChronology();
    return [...eras.flatMap((era) => era.events.map((item) => item.entity)), ...unplaced];
  }
  return entities;
}
