import type { EventStaffRole } from "@/types/auth"
import type { PaymentMethod } from "@/types/database"

export const POS_STAFF_ROLES = ["cashier"] as const satisfies readonly EventStaffRole[]

export type PosStaffRole = (typeof POS_STAFF_ROLES)[number]

export type PosPaymentAlias =
  | "cash"
  | "card"
  | "transfer"
  | "cash_pos"
  | "card_pos"
  | "transfer_pos"

export type PosCanonicalPayment = Extract<
  PaymentMethod,
  "cash_pos" | "card_pos" | "transfer_pos"
>

export function isPosStaffRole(role: string | null | undefined): boolean {
  const value = String(role ?? "").trim()
  return (
    value === "cashier" ||
    value === "box_office_cashier"
  )
}

export function normalizePosPaymentMethod(
  raw: string | null | undefined,
): PosCanonicalPayment | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  if (value === "cash" || value === "efectivo" || value === "cash_pos") {
    return "cash_pos"
  }
  if (
    value === "card" ||
    value === "card_pos" ||
    value === "posnet" ||
    value === "tarjeta"
  ) {
    return "card_pos"
  }
  if (
    value === "transfer" ||
    value === "transfer_pos" ||
    value === "transferencia"
  ) {
    return "transfer_pos"
  }
  return null
}
