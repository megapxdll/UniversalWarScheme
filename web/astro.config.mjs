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
