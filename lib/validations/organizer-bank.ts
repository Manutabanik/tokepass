import { z } from "zod"

const digits = (value: string) => value.replace(/\D/g, "")

/** CUIT/CUIL argentino: 11 dígitos + dígito verificador. */
export function isValidCuitCuil(value: string): boolean {
  const n = digits(value)
  if (n.length !== 11) return false
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = multipliers.reduce(
    (acc, multiplier, index) => acc + Number(n[index]) * multiplier,
    0,
  )
  const rest = 11 - (sum % 11)
  const check = rest === 11 ? 0 : rest === 10 ? 9 : rest
  return check === Number(n[10])
}

/** CBU/CVU: 22 dígitos con ambos dígitos verificadores. */
export function isValidCbuCvu(value: string): boolean {
  const n = digits(value)
  if (n.length !== 22) return false

  const weightsA = [7, 1, 3, 9, 7, 1, 3]
  const sumA = weightsA.reduce(
    (acc, weight, index) => acc + Number(n[index]) * weight,
    0,
  )
  const checkA = (10 - (sumA % 10)) % 10
  if (checkA !== Number(n[7])) return false

  const weightsB = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]
  const sumB = weightsB.reduce(
    (acc, weight, index) => acc + Number(n[8 + index]) * weight,
    0,
  )
  const checkB = (10 - (sumB % 10)) % 10
  return checkB === Number(n[21])
}

export function normalizeTaxId(value: string): string {
  return digits(value)
}

export function normalizeCbu(value: string): string | null {
  const n = digits(value)
  return n.length === 22 ? n : null
}

export const organizerBankSchema = z
  .object({
    fullNameOrCompany: z
      .string()
      .trim()
      .min(2, "Ingresá el titular o la razón social.")
      .max(160, "El titular es demasiado largo."),
    taxId: z
      .string()
      .trim()
      .refine(isValidCuitCuil, "Ingresá un CUIT/CUIL válido de 11 dígitos."),
    destination: z
      .string()
      .trim()
      .min(6, "Ingresá un CBU/CVU de 22 dígitos o un alias.")
      .max(80, "El CBU/alias es demasiado largo."),
    bankName: z
      .string()
      .trim()
      .max(120, "El banco es demasiado largo.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const dest = value.destination.trim()
    const onlyDigits = digits(dest)
    if (onlyDigits.length >= 20 && !isValidCbuCvu(dest)) {
      ctx.addIssue({
        code: "custom",
        path: ["destination"],
        message: "El CBU/CVU debe tener 22 dígitos válidos.",
      })
    }
  })

export type OrganizerBankFormValues = z.infer<typeof organizerBankSchema>

export function splitBankDestination(destination: string): {
  cbu: string | null
  alias: string | null
} {
  const trimmed = destination.trim()
  if (isValidCbuCvu(trimmed)) {
    return { cbu: digits(trimmed), alias: null }
  }
  return { cbu: null, alias: trimmed }
}
