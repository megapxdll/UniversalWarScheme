// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const vaultDir = fileURLToPath(new URL("../Universe War History", import.meta.url));

export default defineConfig({
  site: "http://localhost:4321",
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: "watch-obsidian-vault",
        configureServer(server) {
          server.watcher.add(vaultDir);
          const refreshLoreRoutes = (file = "") => {
            const normalized = file.replaceAll("\\", "/");
            if (file && !normalized.endsWith(".md")) return;
            if (file && !normalized.includes("Universe War History")) return;
            for (const mod of server.moduleGraph.idToModuleMap.values()) {
              const id = mod.id?.replaceAll("\\", "/") ?? "";
              if (
                id.includes("/src/lib/lore") ||
                id.includes("/src/pages/[collection]/[slug].astro") ||
                id.includes("/src/pages/[collection]/index.astro")
              ) {
                server.moduleGraph.invalidateModule(mod);
              }
            }
          };
          server.watcher.on("add", refreshLoreRoutes);
          server.watcher.on("unlink", refreshLoreRoutes);
          server.middlewares.use(async (req, res, next) => {
            const url = req.url ?? "";
            if (!url.startsWith("/api/admin") && !url.startsWith("/canon-images/")) return next();
            try {
              const mod = await server.ssrLoadModule("/src/lib/admin/http.ts");
              if (url.startsWith("/canon-images/")) {
                const served = mod.handleCanonImage(req, res);
                if (!served) next();
                return;
              }
              const handled = await mod.handleAdmin(req, res);
              if (!handled) next();
            } catch (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        },
      },
    ],
    server: {
      fs: {
        allow: [projectRoot],
      },
    },
  },
});
