/** Prefix a site path with Astro's base. Locally that base is `/`; on GitHub Pages it is the repo path. */
export function sitePath(path = "/"): string {
  const base = import.meta.env.BASE_URL || "/";
  if (!path || path === "/") return base;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/$/, "")}${suffix}`;
}
