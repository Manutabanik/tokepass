/** Draft `settings.isPublic` persists as `events.visibility`. There is no `is_public` column. */
export const PUBLIC_CATALOG_VISIBILITY = "public" as const
export const PRIVATE_CATALOG_VISIBILITY = "private" as const

export function catalogVisibilityFromDraft(
  isPublic: unknown,
): typeof PUBLIC_CATALOG_VISIBILITY | typeof PRIVATE_CATALOG_VISIBILITY {
  return isPublic === false
    ? PRIVATE_CATALOG_VISIBILITY
    : PUBLIC_CATALOG_VISIBILITY
}

export function overlayDraftCatalogVisibility<
  T extends { settings: { isPublic?: boolean } },
>(draft: T, isPublic: boolean): { draft: T; changed: boolean } {
  if (draft.settings.isPublic === isPublic) {
    return { draft, changed: false }
  }
  return {
    draft: {
      ...draft,
      settings: { ...draft.settings, isPublic },
    },
    changed: true,
  }
}
