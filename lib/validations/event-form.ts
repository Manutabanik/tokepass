import { z } from "zod"

export const ticketTierSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre para el tier."),
  price: z.number().min(0, "El precio no puede ser negativo."),
  capacity: z.number().int().min(1, "La capacidad debe ser mayor a cero."),
  timeLimit: z.string().optional(),
  bonusReward: z.string().trim().optional(),
})

export const eventFormSchema = z
  .object({
    basics: z.object({
      title: z
        .string()
        .trim()
        .min(3, "El título debe tener al menos 3 caracteres."),
      date: z
        .string()
        .min(1, "Selecciona la fecha y hora.")
        .refine(
          (value) => !Number.isNaN(new Date(value).getTime()),
          "La fecha ingresada no es válida.",
        ),
      description: z
        .string()
        .trim()
        .min(10, "Describe la experiencia en al menos 10 caracteres.")
        .max(2000, "La descripción es demasiado extensa."),
      flyerName: z.string().nullable(),
    }),
    venue: z.object({
      zoneType: z.enum(["general_admission", "reserved_seating"]),
      venueName: z
        .string()
        .trim()
        .min(2, "Ingresa el nombre del recinto."),
      capacity: z.number().int().positive().optional(),
      rows: z.number().int().positive().optional(),
      seatsPerRow: z.number().int().positive().optional(),
    }),
    tickets: z
      .array(ticketTierSchema)
      .min(1, "Debes crear al menos un tipo de entrada."),
    growth: z.object({
      isRRPPEnabled: z.boolean(),
      commissionPercentage: z.number().min(1).max(100).optional(),
      isAddonsEnabled: z.boolean(),
    }),
  })
  .superRefine((data, context) => {
    if (
      data.venue.zoneType === "general_admission" &&
      !data.venue.capacity
    ) {
      context.addIssue({
        code: "custom",
        path: ["venue", "capacity"],
        message: "Define la capacidad total del espacio.",
      })
    }

    if (data.venue.zoneType === "reserved_seating") {
      if (!data.venue.rows) {
        context.addIssue({
          code: "custom",
          path: ["venue", "rows"],
          message: "Define la cantidad de filas.",
        })
      }

      if (!data.venue.seatsPerRow) {
        context.addIssue({
          code: "custom",
          path: ["venue", "seatsPerRow"],
          message: "Define cuántos asientos tiene cada fila.",
        })
      }
    }

    if (
      data.growth.isRRPPEnabled &&
      !data.growth.commissionPercentage
    ) {
      context.addIssue({
        code: "custom",
        path: ["growth", "commissionPercentage"],
        message: "Define una comisión entre 1% y 100%.",
      })
    }
  })

export type EventFormValues = z.infer<typeof eventFormSchema>
