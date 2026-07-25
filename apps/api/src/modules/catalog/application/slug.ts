/**
 * URL slug generation — pure, framework-free, so it is trivially testable and
 * shared by products, categories and brands alike.
 *
 * Uniqueness is not decided here (that needs the database); this only produces
 * the canonical base form. The caller checks availability and, on a clash, asks
 * for the next candidate.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD') // strip accents: "Café" → "Cafe"
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics becomes one hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 80);
}

/**
 * Resolves a unique slug by appending -2, -3, … until `isTaken` says no.
 * A short numeric suffix keeps URLs readable, unlike a random hash.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'item';
  if (!(await isTaken(root))) return root;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Astronomically unlikely; fall back to a timestamp so we never loop forever.
  return `${root}-${Date.now()}`;
}
