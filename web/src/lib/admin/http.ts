import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { ENTITY_TYPES, TYPE_LABELS, getLore, type EntityType } from "../lore";
import { CHARACTER_FOLDERS, writeNote, type CreatePayload } from "./write-note";
import { syncBacklinks } from "./sync-links";
import { parseNote } from "./parse-note";
import { handleCanonImage, savePortrait } from "./images";

const Payload = z.object({
  type: z.string(),
  title: z.string().trim().min(1, "Нужно имя"),
  characterFolder: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  fields: z.record(z.string(), z.any()).optional(),
  sourcePath: z.string().optional(),
});

const Upload = z.object({
  title: z.string().trim().min(1),
  mime: z.string(),
  data: z.string().min(1),
  current: z.string().optional(),
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function asPayload(data: z.infer<typeof Payload>): CreatePayload {
  if (!(ENTITY_TYPES as readonly string[]).includes(data.type)) {
    throw new Error("Неизвестный тип записи");
  }
  return {
    type: data.type as EntityType,
    title: data.title,
    characterFolder: data.characterFolder,
    aliases: data.aliases,
    fields: data.fields ?? {},
  };
}

function createdBody(payload: CreatePayload, relativePath: string, linked: string[]) {
  return {
    ok: true,
    title: payload.title,
    type: payload.type,
    path: relativePath,
    wiki: `[[${payload.title}]]`,
    linked,
  };
}

export function catalog() {
  return {
    types: ENTITY_TYPES.map((type) => ({ type, label: TYPE_LABELS[type] })),
    characterFolders: CHARACTER_FOLDERS,
    entities: getLore().entities.map((entity) => ({
      title: entity.title,
      type: entity.type,
      typeLabel: TYPE_LABELS[entity.type],
      href: entity.href,
      sourcePath: entity.sourcePath,
      names: entity.names,
      portraitUrl: entity.extra.portraitUrl,
    })),
  };
}

export { handleCanonImage };

export async function handleAdmin(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/admin")) return false;

  if (req.method === "GET" && url.pathname === "/api/admin/catalog") {
    send(res, 200, catalog());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/note") {
    try {
      const sourcePath = url.searchParams.get("path") ?? "";
      if (!sourcePath) {
        send(res, 400, { error: "Нужен путь записи" });
        return true;
      }
      send(res, 200, parseNote(sourcePath));
    } catch (error) {
      send(res, 404, { error: error instanceof Error ? error.message : "Запись не найдена" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/upload") {
    try {
      const parsed = Upload.safeParse(JSON.parse((await readBody(req)) || "{}"));
      if (!parsed.success) {
        send(res, 400, { error: parsed.error.issues[0]?.message ?? "Некорректные данные" });
        return true;
      }
      const saved = savePortrait(parsed.data);
      send(res, 201, saved);
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : "Не удалось сохранить картинку" });
    }
    return true;
  }

  if (req.method === "POST" && (url.pathname === "/api/admin/create" || url.pathname === "/api/admin/update")) {
    try {
      const parsed = Payload.safeParse(JSON.parse((await readBody(req)) || "{}"));
      if (!parsed.success) {
        send(res, 400, { error: parsed.error.issues[0]?.message ?? "Некорректные данные" });
        return true;
      }
      const payload = asPayload(parsed.data);
      const sourcePath = url.pathname === "/api/admin/update" ? parsed.data.sourcePath : undefined;
      if (url.pathname === "/api/admin/update" && !sourcePath) {
        send(res, 400, { error: "Нужен путь записи для правки" });
        return true;
      }
      const duplicate = getLore().resolve(payload.title);
      if (!sourcePath && duplicate) {
        send(res, 409, { error: `Уже есть запись «${duplicate.title}» (${duplicate.sourcePath})` });
        return true;
      }
      const written = writeNote(payload, sourcePath ? { sourcePath } : undefined);
      const linked = syncBacklinks(payload);
      send(res, url.pathname === "/api/admin/create" ? 201 : 200, createdBody(payload, written.relativePath, linked));
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : "Не удалось сохранить запись" });
    }
    return true;
  }

  send(res, 404, { error: "Нет такого метода" });
  return true;
}
