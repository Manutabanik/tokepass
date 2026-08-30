import { isEventDraftOnline, type EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function nextMirroredAccessLink(input: {
  draft: Pick<EventDraftV2, "isVirtual" | "virtualLink" | "settings">
  liveAccessLink?: string | null
}): string | null {
  if (isEventDraftOnline(input.draft)) {
    return input.draft.virtualLink.trim() || null
  }
  // Presencial drafts must not wipe a live stream URL. Publish still
  // clears access_link when the event really leaves ONLINE.
  return input.liveAccessLink?.trim() || null
}

/**
 * Autosave may hide a listed event. It must never list a private or
 * guest-list event — stale drafts default isPublic to true.
 */
export function nextMirroredCatalogVisibility(input: {
  liveVisibility?: string | null
  isPublic: boolean
}): "private" | null {
  const live = input.liveVisibility?.trim() || ""
  if (live !== "public") return null
  if (input.isPublic !== false) return null
  return "private"
}

export function preservePublishedEventVisibility(
  liveVisibility: string | null | undefined,
  draftVisibility: "public" | "private",
): "public" | "private" | "guest_list_only" {
  if (liveVisibility?.trim() === "guest_list_only") return "guest_list_only"
  return draftVisibility
}
