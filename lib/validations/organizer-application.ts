import { z } from "zod"

const digits = (value: string) => value.replace(/\D/g, "")

export const organizerApplicationSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de la productora.")
    .max(160, "El nombre es demasiado largo."),
  cuitCuil: z
    .string()
    .trim()
    .refine((value) => {
      const n = digits(value)
      return n.length >= 10 && n.length <= 13
    }, "Ingresá un CUIT/CUIL válido (solo números)."),
  responsibleDni: z
    .string()
    .trim()
    .refine((value) => {
      const n = digits(value)
      return n.length >= 7 && n.length <= 10
    }, "Ingresá el DNI del responsable (7 a 10 dígitos)."),
  cbuAlias: z
    .string()
    .trim()
    .min(6, "Ingresá CBU o alias para liquidaciones.")
    .max(80, "El CBU/alias es demasiado largo."),
  socialMediaUrl: z
    .string()
    .trim()
    .min(8, "Ingresá Instagram o el sitio web de la productora.")
    .max(500, "La URL es demasiado larga.")
    .refine((value) => {
      const lower = value.toLowerCase()
      return (
        lower.includes("instagram.com") ||
        lower.includes("http://") ||
        lower.includes("https://") ||
        lower.startsWith("www.") ||
        lower.startsWith("@")
      )
    }, "Usá un link de Instagram/web o un @usuario."),
})

export type OrganizerApplicationFormValues = z.infer<
  typeof organizerApplicationSchema
>
