import { z } from "zod"

export const eventDraftV2Schema = z
  .object({
    title: z.string().default(""),
  })
  .passthrough()

export type EventDraftV2 = z.infer<typeof eventDraftV2Schema>

export function emptyEventDraftV2(): EventDraftV2 {
  return { title: "" }
}

export function parseEventDraftV2(raw: unknown): EventDraftV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyEventDraftV2()
  }
  const record = raw as Record<string, unknown>
  return {
    ...record,
    title: typeof record.title === "string" ? record.title : "",
  }
}
