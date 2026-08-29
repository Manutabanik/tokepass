/** Columna canónica: solo `true` absorbe. null/undefined/false = el comprador paga. */
export function eventAbsorbFeesFromRow(
  row: { absorb_fees?: boolean | null } | null | undefined,
): boolean {
  return row?.absorb_fees === true
}

export function overlayDraftAbsorbFees<
  T extends { settings: { absorbFees?: boolean } },
>(draft: T, absorbFees: boolean): { draft: T; changed: boolean } {
  if (draft.settings.absorbFees === absorbFees) {
    return { draft, changed: false }
  }
  return {
    draft: {
      ...draft,
      settings: { ...draft.settings, absorbFees },
    },
    changed: true,
  }
}
