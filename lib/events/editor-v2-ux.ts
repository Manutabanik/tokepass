/** Idle window before Editor V2 writes `draft_state` to Supabase. */
export const EDITOR_V2_AUTOSAVE_MS = 1500
export const EDITOR_V2_AUTOSAVE_MIN_MS = 1500
export const EDITOR_V2_AUTOSAVE_MAX_MS = 2000

export const DRAFT_LEAVE_GUARD_MESSAGE =
  "Hay un guardado en curso. Si salís ahora podés perder cambios del borrador."

export const OFFLINE_SAVE_LABEL = "Sin conexión (Cambios locales)"

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error" | "offline"

export type DraftSaveBadgeTone = "idle" | "saving" | "saved" | "error" | "offline"

export function shouldBlockDraftLeave(
  saveStatus: DraftSaveStatus,
  publishing = false,
): boolean {
  return publishing || saveStatus === "saving"
}

export function draftSaveBadge(online: boolean, saveStatus: DraftSaveStatus): {
  label: string
  tone: DraftSaveBadgeTone
} {
  if (!online || saveStatus === "offline") {
    return { label: OFFLINE_SAVE_LABEL, tone: "offline" }
  }
  if (saveStatus === "saving") {
    return { label: "Guardando...", tone: "saving" }
  }
  if (saveStatus === "saved") {
    return { label: "Guardado", tone: "saved" }
  }
  if (saveStatus === "error") {
    return { label: "Error al guardar", tone: "error" }
  }
  return { label: "Sin cambios", tone: "idle" }
}

export function salesDashboardPath(eventId: string): string {
  return `/admin/events/${eventId.trim()}`
}

export function publishedEventPublicPath(
  eventId: string,
  slug?: string | null,
): string {
  const key = slug?.trim() || eventId.trim()
  return `/eventos/${key}`
}

export function eventPreviewPath(eventId: string): string {
  return `/events/preview/${eventId.trim()}`
}

export function isInAppLeaveNavigation(input: {
  currentHref: string
  nextHref: string
  button?: number
  modified?: boolean
  targetBlank?: boolean
  download?: boolean
}): boolean {
  if ((input.button ?? 0) !== 0) return false
  if (input.modified || input.targetBlank || input.download) return false
  try {
    const current = new URL(input.currentHref)
    const next = new URL(input.nextHref, input.currentHref)
    if (next.origin !== current.origin) return false
    if (next.pathname === current.pathname && next.search === current.search) {
      return false
    }
    return true
  } catch {
    return false
  }
}
