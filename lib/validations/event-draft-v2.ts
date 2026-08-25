import { z } from "zod"

export const eventDraftV2Schema = z.object({
  title: z.string().trim().min(1, "Ponéle un nombre al evento"),
})

export type EventDraftV2 = z.infer<typeof eventDraftV2Schema>

export function parseEventDraftV2(raw: unknown): EventDraftV2 {
  const title =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { title?: unknown }).title === "string"
      ? (raw as { title: string }).title
      : ""
  return { title }
}
