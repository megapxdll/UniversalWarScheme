import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getVaultRoot } from "../lore";
import { slugify } from "../slug";
import { safeNoteName } from "./yaml";

export const VAULT_PORTRAIT_DIR = "08_Assets/characters";
export const PUBLIC_PORTRAIT_DIR = "canon-images";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_BYTES = 8 * 1024 * 1024;

export function portraitPublicUrl(filename: string | undefined): string | undefined {
  if (!filename) return undefined;
  const name = filename.replaceAll("\\", "/").split("/").pop()?.trim();
  if (!name) return undefined;
  return `/canon-images/${encodeURIComponent(name)}`;
}

export function portraitBasename(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/^!\[\[/, "")
    .replace(/\]\]$/, "")
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.trim() ?? "";
}

function publicDir(): string {
  return path.join(process.cwd(), "public", PUBLIC_PORTRAIT_DIR);
}

function vaultDir(): string {
  return path.join(getVaultRoot(), VAULT_PORTRAIT_DIR);
}

export function savePortrait(input: {
  title: string;
  mime: string;
  data: string;
  current?: string;
}): { filename: string; url: string } {
  const ext = MIME_EXT[input.mime.toLowerCase()];
  if (!ext) throw new Error("Нужен файл JPG, PNG, WEBP или GIF");
  const raw = input.data.replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) throw new Error("Пустая картинка");
  if (buf.length > MAX_BYTES) throw new Error("Картинка больше 8 МБ");

  const vaultFolder = vaultDir();
  const siteFolder = publicDir();
  fs.mkdirSync(vaultFolder, { recursive: true });
  fs.mkdirSync(siteFolder, { recursive: true });

  const current = portraitBasename(input.current);
  const keep =
    current && path.extname(current).slice(1).toLowerCase() === ext ? current : "";
  const stem = slugify(safeNoteName(input.title)) || "portrait";
  let filename = keep;
  if (!filename) {
    let i = 0;
    while (true) {
      const candidate = i === 0 ? `${stem}.${ext}` : `${stem}-${i}.${ext}`;
      if (!fs.existsSync(path.join(vaultFolder, candidate)) && !fs.existsSync(path.join(siteFolder, candidate))) {
        filename = candidate;
        break;
      }
      i += 1;
    }
  }

  fs.writeFileSync(path.join(vaultFolder, filename), buf);
  fs.writeFileSync(path.join(siteFolder, filename), buf);
  return { filename, url: portraitPublicUrl(filename)! };
}

export function handleCanonImage(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!url.pathname.startsWith("/canon-images/")) return false;

  const name = path.basename(decodeURIComponent(url.pathname.slice("/canon-images/".length)));
  if (!name || name.startsWith(".")) {
    res.statusCode = 400;
    res.end();
    return true;
  }

  const file = [
    path.join(publicDir(), name),
    path.join(vaultDir(), name),
    path.join(getVaultRoot(), "08_Assets/factions", name),
    path.join(getVaultRoot(), "08_Assets/rules", name),
    path.join(getVaultRoot(), "08_Assets", name),
  ].find((candidate) => fs.existsSync(candidate));
  if (!file) return false;

  const mime = EXT_MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=3600");
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
}
