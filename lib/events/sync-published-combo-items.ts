import type { PublishEventV2TierPayload } from "@/lib/events/publish-event-v2"

type ComboSyncClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{
        data: Array<{ id: string; name: string; ticket_type?: string | null }> | null
        error: { message: string } | null
      }>
    }
  }
  rpc: (
    fn: "sync_combo_items",
    args: { p_combo_tier_id: string; p_schedule_ids: string[] },
  ) => PromiseLike<{ error: { message: string } | null }>
}

export function comboSchedulesFromPublishedTickets(
  tickets: PublishEventV2TierPayload[],
): Array<{ name: string; scheduleIds: string[] }> {
  return tickets
    .filter((ticket) => ticket.ticket_type === "combo")
    .map((ticket) => ({
      name: ticket.name.trim(),
      scheduleIds: [...new Set(ticket.combo_schedule_ids ?? [])].filter(Boolean),
    }))
    .filter((row) => row.name.length > 0 && row.scheduleIds.length >= 2)
}

export function ticketsWithoutComboScheduleIds(
  tickets: PublishEventV2TierPayload[],
): Omit<PublishEventV2TierPayload, "combo_schedule_ids">[] {
  return tickets.map((ticket) => {
    const rest = { ...ticket }
    delete rest.combo_schedule_ids
    return rest
  })
}

export async function syncPublishedComboItems(input: {
  db: ComboSyncClient
  eventId: string
  tickets: PublishEventV2TierPayload[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const packs = comboSchedulesFromPublishedTickets(input.tickets)
  if (packs.length === 0) return { ok: true }

  const published = await input.db
    .from("ticket_tiers")
    .select("id, name, ticket_type")
    .eq("event_id", input.eventId)
  if (published.error) {
    return { ok: false, error: published.error.message }
  }

  for (const pack of packs) {
    const row = (published.data ?? []).find(
      (tier) =>
        tier.name.trim() === pack.name &&
        (tier.ticket_type ?? "standard") === "combo",
    )
    if (!row) continue
    const synced = await input.db.rpc("sync_combo_items", {
      p_combo_tier_id: row.id,
      p_schedule_ids: pack.scheduleIds,
    })
    if (synced.error) {
      if (/could not find|schema cache|does not exist|pgrst202/i.test(synced.error.message)) {
        return { ok: true }
      }
      return { ok: false, error: synced.error.message }
    }
  }
  return { ok: true }
}
