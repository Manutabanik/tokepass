import { z } from "zod"

import {
  isStrictEmail,
  isValidArgentineMobile,
  normalizeArgentineMobile,
  normalizeEmail,
} from "@/lib/checkout/guest-input"

export const organizerLeadSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre.")
    .max(120, "El nombre es demasiado largo."),
  email: z
    .string()
    .trim()
    .transform((value) => normalizeEmail(value))
    .refine(isStrictEmail, "Ingresá un email válido."),
  phone: z
    .string()
    .trim()
    .refine(isValidArgentineMobile, "Ingresá un celular argentino con código de área.")
    .transform((value) => normalizeArgentineMobile(value) ?? value),
  eventName: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del evento.")
    .max(160, "El nombre del evento es demasiado largo."),
  estimatedAttendance: z.coerce
    .number()
    .int("La asistencia debe ser un número entero.")
    .min(1, "Indicá al menos 1 persona.")
    .max(200000, "La asistencia estimada es demasiado alta."),
})

export type OrganizerLeadInput = z.infer<typeof organizerLeadSchema>
