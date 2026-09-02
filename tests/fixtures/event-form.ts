/**
 * Fixtures del formulario de evento para los tests unitarios.
 *
 * `blankDraftTicket()` es la misma base que usa `normalizeEventFormValues`, asi
 * que un tier de test no puede quedar desalineado del schema: si `zod` gana un
 * campo obligatorio, la fixture ya lo trae.
 */

import {
  blankDraftTicket,
  coerceDraftEventForm,
  draftEventSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"

export type EventFormTicket = EventFormValues["tickets"][number]

export function eventFormTicket(
  overrides: Partial<EventFormTicket> = {},
): EventFormTicket {
  return { ...blankDraftTicket(), ...overrides }
}

/**
 * `basics` y `venue` se mergean campo a campo porque los tests solo declaran
 * el par de flags que el caso ejercita.
 */
type EventFormValuesOverrides = Omit<
  Partial<EventFormValues>,
  "basics" | "venue"
> & {
  basics?: Partial<EventFormValues["basics"]>
  venue?: Partial<EventFormValues["venue"]>
}

export function eventFormValues(
  overrides: EventFormValuesOverrides = {},
): EventFormValues {
  // El mismo camino que usa el editor para completar un borrador, asi que la
  // fixture nunca queda corta de campos obligatorios.
  const base = coerceDraftEventForm(
    draftEventSchema.parse({ basics: { title: "Evento de prueba" } }),
  )
  const { basics, venue, ...rest } = overrides
  return {
    ...base,
    ...rest,
    basics: { ...base.basics, ...basics },
    venue: { ...base.venue, ...venue },
  }
}
