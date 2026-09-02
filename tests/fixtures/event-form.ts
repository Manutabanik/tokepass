/**
 * Fixtures del formulario de evento para los tests unitarios.
 *
 * `blankDraftTicket()` es la misma base que usa `normalizeEventFormValues`, asi
 * que un tier de test no puede quedar desalineado del schema: si `zod` gana un
 * campo obligatorio, la fixture ya lo trae.
 */

import {
  blankDraftTicket,
  type EventFormValues,
} from "@/lib/validations/event-form"

export type EventFormTicket = EventFormValues["tickets"][number]

export function eventFormTicket(
  overrides: Partial<EventFormTicket> = {},
): EventFormTicket {
  return { ...blankDraftTicket(), ...overrides }
}
