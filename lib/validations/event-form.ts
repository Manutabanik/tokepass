import { z } from "zod"

import { EVENT_VISIBILITY_VALUES } from "@/types/events"
import { TICKET_TIER_VISIBILITY_VALUES } from "@/types/tickets"

/** ATP = Apta Todo Público. */
export const AGE_RESTRICTION_VALUES = ["atp", "16", "18"] as const
export type AgeRestriction = (typeof AGE_RESTRICTION_VALUES)[number]

export const AGE_RESTRICTION_LABELS: Record<AgeRestriction, string> = {
  atp: "ATP",
  "16": "+16",
  "18": "+18",
}

export const MAX_EVENT_FLYER_BYTES = 5 * 1024 * 1024

export const scheduleDaySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2, "Nombrá la jornada."),
  startTime: z
    .string()
    .min(1, "Definí el inicio de la jornada.")
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "La hora de inicio no es válida.",
    ),
  endTime: z
    .string()
    .min(1, "Definí el cierre de la jornada.")
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "La hora de cierre no es válida.",
    ),
})

export const ticketTierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Ingresá un nombre para el tipo de entrada."),
  price: z
    .number({ error: "Indicá el precio de la entrada." })
    .min(0, "El precio no puede ser negativo."),
  capacity: z
    .number({ error: "Indicá la capacidad de esta entrada." })
    .int()
    .min(1, "La cantidad de personas debe ser mayor a cero."),
  sold: z.number().int().min(0).optional(),
  timeLimit: z.string().optional(),
  bonusReward: z.string().trim().optional(),
  /** null / "all" / "" = abono completo */
  dayId: z.string().nullable().optional(),
  visibility: z.enum(TICKET_TIER_VISIBILITY_VALUES),
  layoutType: z.enum(["general", "table_combo", "numbered_seat"]),
  seatingSectorId: z.string().trim().nullable().optional(),
  capacityPerUnit: z.number().int().min(1).max(100),
})

export const eventFormSchema = z
  .object({
    basics: z.object({
      title: z
        .string()
        .trim()
        .min(3, "El título debe tener al menos 3 caracteres."),
      date: z.string(),
      /** Hora de cierre (solo jornada única). */
      endDate: z.string(),
      description: z
        .string()
        .trim()
        .min(10, "Describí la experiencia en al menos 10 caracteres.")
        .max(2000, "La descripción es demasiado extensa."),
      flyerName: z.string().nullable(),
      visibility: z.enum(EVENT_VISIBILITY_VALUES),
      isMultiDay: z.boolean(),
      scheduleDays: z.array(scheduleDaySchema),
      categoryId: z.string().uuid("Seleccioná una categoría de la lista."),
      ageRestriction: z.enum(AGE_RESTRICTION_VALUES, {
        error: "Seleccioná la restricción de edad.",
      }),
    }),
    venue: z.object({
      mode: z.enum(["existing", "new"]),
      existingVenueId: z.string().uuid().optional().nullable(),
      zoneType: z.enum(["general_admission", "reserved_seating"]),
      venueName: z
        .string()
        .trim()
        .min(2, "Ingresá el nombre del lugar."),
      venueLocation: z.string().trim().optional(),
      venueCity: z.string().trim().optional(),
      capacity: z.number().int().positive().optional(),
      rows: z.number().int().positive().optional(),
      seatsPerRow: z.number().int().positive().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      seatingBackgroundUrl: z.string().nullable().optional(),
      saveVenueForReuse: z.boolean(),
      zones: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            type: z.enum(["general_admission", "reserved_seating"]),
            capacity: z.number().int().positive(),
            rows: z.number().int().positive().optional().nullable(),
            seatsPerRow: z.number().int().positive().optional().nullable(),
          }),
        )
        .optional(),
    }),
    tickets: z
      .array(ticketTierSchema)
      .min(1, "Creá al menos un tipo de entrada."),
  })
  .superRefine((data, context) => {
    const tierNames = new Set<string>()
    for (const [index, tier] of data.tickets.entries()) {
      const normalizedName = tier.name.trim().toLocaleLowerCase("es")
      if (tierNames.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "name"],
          message: "Los nombres de las entradas deben ser únicos.",
        })
      }
      tierNames.add(normalizedName)

      if (tier.layoutType !== "general" && !tier.seatingSectorId) {
        context.addIssue({
          code: "custom",
          path: ["tickets", index, "seatingSectorId"],
          message: "Seleccioná la zona numerada de esta entrada.",
        })
      }
    }

    if (data.basics.isMultiDay) {
      if (data.basics.scheduleDays.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["basics", "scheduleDays"],
          message: "Un festival necesita al menos dos jornadas.",
        })
      }
      for (const [index, day] of data.basics.scheduleDays.entries()) {
        const start = new Date(day.startTime).getTime()
        const end = new Date(day.endTime).getTime()
        if (!(end > start)) {
          context.addIssue({
            code: "custom",
            path: ["basics", "scheduleDays", index, "endTime"],
            message: "El cierre debe ser posterior al inicio.",
          })
        }
      }
    } else {
      const date = data.basics.date?.trim() ?? ""
      if (!date || Number.isNaN(new Date(date).getTime())) {
        context.addIssue({
          code: "custom",
          path: ["basics", "date"],
          message: "Seleccioná la fecha y hora de inicio.",
        })
      }

      const endDate = data.basics.endDate?.trim() ?? ""
      if (!endDate || Number.isNaN(new Date(endDate).getTime())) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "Seleccioná la hora de finalización.",
        })
      } else if (date && new Date(endDate).getTime() <= new Date(date).getTime()) {
        context.addIssue({
          code: "custom",
          path: ["basics", "endDate"],
          message: "La finalización debe ser posterior al inicio.",
        })
      }
    }

    if (data.venue.mode === "existing" && !data.venue.existingVenueId) {
      context.addIssue({
        code: "custom",
        path: ["venue", "existingVenueId"],
        message: "Seleccioná un lugar guardado.",
      })
    }

    const hasBlueprintZones = (data.venue.zones?.length ?? 0) > 0

    if (!hasBlueprintZones) {
      if (
        data.venue.zoneType === "general_admission" &&
        !data.venue.capacity
      ) {
        context.addIssue({
          code: "custom",
          path: ["venue", "capacity"],
          message: "Definí cuántas personas entran al espacio.",
        })
      }

      if (data.venue.zoneType === "reserved_seating") {
        if (!data.venue.rows) {
          context.addIssue({
            code: "custom",
            path: ["venue", "rows"],
            message: "Definí la cantidad de filas.",
          })
        }

        if (!data.venue.seatsPerRow) {
          context.addIssue({
            code: "custom",
            path: ["venue", "seatsPerRow"],
            message: "Definí cuántos asientos tiene cada fila.",
          })
        }
      }
    }

    if (data.basics.isMultiDay) {
      const dayIds = new Set(data.basics.scheduleDays.map((day) => day.id))
      for (const [index, tier] of data.tickets.entries()) {
        const dayId = tier.dayId?.trim()
        if (dayId && dayId !== "all" && !dayIds.has(dayId)) {
          context.addIssue({
            code: "custom",
            path: ["tickets", index, "dayId"],
            message: "Elegí una jornada válida o Abono completo.",
          })
        }
      }
    }
  })

export type EventFormValues = z.infer<typeof eventFormSchema>
export type ScheduleDayFormValue = z.infer<typeof scheduleDaySchema>
