import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function draftInventoryIdentity(
  draft: Pick<EventDraftV2, "tickets" | "extras">,
): string {
  return JSON.stringify({
    tickets: draft.tickets.map((item) => [
      item.id,
      item.source,
      item.sectorId,
      item.layoutType,
      item.slotId,
      [...(item.validDayIds ?? [])].sort(),
    ]),
    extras: draft.extras.map((item) => [item.id, item.source, item.sectorId]),
  })
}

export function draftInventoryDrifted(
  current: Pick<EventDraftV2, "tickets" | "extras">,
  saved: Pick<EventDraftV2, "tickets" | "extras">,
): boolean {
  return draftInventoryIdentity(current) !== draftInventoryIdentity(saved)
}

/** Idle window before Editor V2 writes `draft_state` to Supabase. */
export const EDITOR_V2_AUTOSAVE_MS = 1500
export const EDITOR_V2_AUTOSAVE_MIN_MS = 1500
export const EDITOR_V2_AUTOSAVE_MAX_MS = 2000
/** Abort a hung Server Action so the UI never stays on "Guardando...". */
export const EDITOR_V2_AUTOSAVE_TIMEOUT_MS = 10_000

export const DRAFT_LEAVE_GUARD_MESSAGE =
  "Tenés cambios sin guardar o un guardado en curso. Si salís ahora podés perder cambios del borrador."

export const DRAFT_SAVE_TIMEOUT_MESSAGE =
  "Error al guardar. El servidor no respondió a tiempo. Reintentá."

export class DraftPersistTimeoutError extends Error {
  constructor(message = DRAFT_SAVE_TIMEOUT_MESSAGE) {
    super(message)
    this.name = "DraftPersistTimeoutError"
  }
}

export function isDraftPersistTimeoutError(error: unknown): boolean {
  return (
    error instanceof DraftPersistTimeoutError ||
    (error instanceof Error && error.name === "DraftPersistTimeoutError")
  )
}

export async function withDraftPersistTimeout<T>(
  promise: Promise<T>,
  ms = EDITOR_V2_AUTOSAVE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DraftPersistTimeoutError())
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const OFFLINE_SAVE_LABEL = "Sin conexión (Cambios locales)"

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error" | "offline"

export type DraftSaveBadgeTone = "idle" | "saving" | "saved" | "error" | "offline"

export function shouldBlockDraftLeave(
  saveStatus: DraftSaveStatus,
  flags: {
    isDirty?: boolean
    isSubmitting?: boolean
    allowLeave?: boolean
  } = {},
): boolean {
  if (flags.allowLeave || flags.isSubmitting) return false
  if (saveStatus === "saving") return true
  return flags.isDirty === true
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
