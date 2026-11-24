/** Saved population URLs: legacy flat runs, or bounded variant/category/run folders. */
export function isCohortArchivePath(file: string): boolean {
  const segment = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
  return new RegExp(`^/training-cohorts/(?:(?:${segment}/)?|variant-[12]/${segment}/(?:${segment}/)?)\\d{5}\\.json\\.gz$`).test(file);
}
