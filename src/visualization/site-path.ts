/** Keep navigation and saved assets inside the app when hosted under a subdirectory. */
export const SITE_BASE = import.meta.env?.BASE_URL ?? "/";

export function sitePath(path = "/", base = SITE_BASE) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path)) return path;
  const prefix = base.replace(/^\/+|\/+$/g, "");
  return `${prefix ? `/${prefix}` : ""}/${path.replace(/^\/+/, "")}`;
}
