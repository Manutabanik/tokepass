export function publicEventSlugsForRevalidate(
  ...values: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>()
  const slugs: string[] = []
  for (const value of values) {
    const slug = String(value ?? "").trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    slugs.push(slug)
  }
  return slugs
}
