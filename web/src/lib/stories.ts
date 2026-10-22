import { getChronology } from "./chronology";
import { entitiesOf, getLore, type LoreEntity } from "./lore";
import type { StoryWorld } from "./story-world";

export type StoryHub = {
  world: StoryWorld;
  characters: LoreEntity[];
  events: LoreEntity[];
  factions: LoreEntity[];
  eras: { period: LoreEntity; events: LoreEntity[] }[];
  unplaced: LoreEntity[];
  connections: StoryConnection[];
  guests: StoryConnection[];
};

export type StoryConnection = {
  character: LoreEntity;
  home: StoryWorld;
  events: LoreEntity[];
};

function eventOrder(): Map<string, number> {
  const { eras, unplaced } = getChronology();
  const map = new Map<string, number>();
  let index = 0;
  for (const era of eras) {
    for (const item of era.events) map.set(item.entity.id, index++);
  }
  for (const event of unplaced) map.set(event.id, index++);
  return map;
}

function sortByCanon(entities: LoreEntity[]): LoreEntity[] {
  const order = eventOrder();
  return entities.slice().sort((a, b) => {
    const left = order.get(a.id) ?? 9000;
    const right = order.get(b.id) ?? 9000;
    if (left !== right) return left - right;
    return a.title.localeCompare(b.title, "ru");
  });
}

export function ofStory(type: LoreEntity["type"], world: StoryWorld): LoreEntity[] {
  const list = entitiesOf(type).filter((entity) => entity.story === world);
  if (type === "event") return sortByCanon(list);
  return list;
}

export function eventsMentioning(character: LoreEntity): LoreEntity[] {
  const lore = getLore();
  const seen = new Set<string>();
  const events: LoreEntity[] = [];
  const add = (entity?: LoreEntity) => {
    if (!entity || entity.type !== "event" || seen.has(entity.id)) return;
    seen.add(entity.id);
    events.push(entity);
  };
  for (const item of lore.incoming.get(character.id) ?? []) add(item);
  return sortByCanon(events);
}

export function characterStoryLinks(character: LoreEntity): {
  local: LoreEntity[];
  elsewhere: LoreEntity[];
} {
  const events = eventsMentioning(character);
  return {
    local: events.filter((event) => event.story === character.story),
    elsewhere: events.filter((event) => event.story !== character.story),
  };
}

function byName(a: StoryConnection, b: StoryConnection): number {
  return a.character.title.localeCompare(b.character.title, "ru");
}

export function storyConnections(): StoryConnection[] {
  return entitiesOf("character")
    .map((character) => ({
      character,
      home: character.story,
      events: characterStoryLinks(character).elsewhere,
    }))
    .filter((item) => item.events.length > 0)
    .sort(byName);
}

export function outgoingConnections(home: StoryWorld): StoryConnection[] {
  return storyConnections().filter((item) => item.home === home);
}

export function guestConnections(world: StoryWorld): StoryConnection[] {
  return entitiesOf("character")
    .filter((character) => character.story !== world)
    .map((character) => ({
      character,
      home: character.story,
      events: characterStoryLinks(character).elsewhere.filter((event) => event.story === world),
    }))
    .filter((item) => item.events.length > 0)
    .sort(byName);
}

export function getStoryHub(world: StoryWorld): StoryHub {
  const events = ofStory("event", world);
  const eventIds = new Set(events.map((event) => event.id));
  const { eras, unplaced } = getChronology();
  return {
    world,
    characters: ofStory("character", world),
    events,
    factions: ofStory("faction", world),
    eras: eras
      .map((era) => ({
        period: era.period,
        events: era.events.map((item) => item.entity).filter((event) => eventIds.has(event.id)),
      }))
      .filter((era) => era.events.length > 0 || era.period.story === world),
    unplaced: unplaced.filter((event) => eventIds.has(event.id)),
    connections: world === "universe" ? storyConnections() : outgoingConnections(world),
    guests: world === "universe" ? [] : guestConnections(world),
  };
}
