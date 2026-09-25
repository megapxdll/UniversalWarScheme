import type { APIRoute } from "astro";
import { getLore } from "../lib/lore";

export const GET: APIRoute = () => {
  const lore = getLore();
  const payload = {
    generatedAt: new Date().toISOString(),
    entities: lore.entities.map((entity) => ({
      id: entity.id,
      slug: entity.slug,
      type: entity.type,
      title: entity.title,
      status: entity.status,
      href: entity.href,
      excerpt: entity.excerpt,
      aliases: entity.aliases,
      tags: entity.tags,
      extra: entity.extra,
      wikiLinks: entity.wikiLinks.map((link) => link.target),
      sourcePath: entity.sourcePath,
    })),
    edges: lore.edges,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
