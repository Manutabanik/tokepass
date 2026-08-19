/** Canonical paid-order ledger for organizer dashboards and exports. */

import {
  centsBigIntToMoney,
  formatCentsAsArs,
  formatCentsAsDecimal,
  moneyToCentsBigInt,
} from "@/lib/money/cents"

export type OrganizerPaidLedger = {
  grossRevenue: number
  tokepassServiceCharge: number
  organizerNetPayout: number
}

export type OrganizerPaidLedgerCents = {
  grossRevenueCents: bigint
  tokepassServiceChargeCents: bigint
  organizerNetPayoutCents: bigint
}

export type PaidLedgerOrderLike = {
  status?: string | null
  total_amount?: number | string | null
  totalAmount?: number | string | null
  service_charge?: number | string | null
  serviceCharge?: number | string | null
}

export type LedgerRecentSale = {
  id: string
  date: string
  amount: number
  status: string
  buyerName: string
}

function toMoney(value: number | string | null | undefined): number {
  return centsBigIntToMoney(moneyToCentsBigInt(value))
}

export function isPaidOrderStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "paid"
}

export function paidLedgerToCents(
  ledger: OrganizerPaidLedger,
): OrganizerPaidLedgerCents {
  const grossRevenueCents = moneyToCentsBigInt(ledger.grossRevenue)
  const tokepassServiceChargeCents = moneyToCentsBigInt(
    ledger.tokepassServiceCharge,
  )
  return {
    grossRevenueCents,
    tokepassServiceChargeCents,
    organizerNetPayoutCents: grossRevenueCents - tokepassServiceChargeCents,
  }
}

export function paidLedgerFromCents(
  cents: OrganizerPaidLedgerCents,
): OrganizerPaidLedger {
  return {
    grossRevenue: centsBigIntToMoney(cents.grossRevenueCents),
    tokepassServiceCharge: centsBigIntToMoney(cents.tokepassServiceChargeCents),
    organizerNetPayout: centsBigIntToMoney(cents.organizerNetPayoutCents),
  }
}

export function roundLedger(ledger: OrganizerPaidLedger): OrganizerPaidLedger {
  return paidLedgerFromCents(paidLedgerToCents(ledger))
}

/**
 * GMV from confirmed orders only. Pending / failed / expired never enter
 * gross_revenue, platform fees, or organizer net payout.
 */
export function paidLedgerCentsFromOrders(
  orders: PaidLedgerOrderLike[],
): OrganizerPaidLedgerCents {
  let grossRevenueCents = BigInt(0)
  let tokepassServiceChargeCents = BigInt(0)
  for (const order of orders) {
    if (!isPaidOrderStatus(order.status)) continue
    grossRevenueCents += moneyToCentsBigInt(
      order.total_amount ?? order.totalAmount,
    )
    tokepassServiceChargeCents += moneyToCentsBigInt(
      order.service_charge ?? order.serviceCharge,
    )
  }
  return {
    grossRevenueCents,
    tokepassServiceChargeCents,
    organizerNetPayoutCents: grossRevenueCents - tokepassServiceChargeCents,
  }
}

export function paidLedgerFromOrders(
  orders: PaidLedgerOrderLike[],
): OrganizerPaidLedger {
  return paidLedgerFromCents(paidLedgerCentsFromOrders(orders))
}

export function paidLedgerFromRpc(raw: unknown): OrganizerPaidLedger | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const hasCanonical =
    "gross_revenue" in row ||
    "grossRevenue" in row ||
    "tokepass_service_charge" in row ||
    "organizer_net_payout" in row
  if (!hasCanonical) return null

  const grossRevenue = toMoney(
    (row.gross_revenue as number | string | null | undefined) ??
      (row.grossRevenue as number | string | null | undefined),
  )
  const tokepassServiceCharge = toMoney(
    (row.tokepass_service_charge as number | string | null | undefined) ??
      (row.tokepassServiceCharge as number | string | null | undefined) ??
      (row.platformFees as number | string | null | undefined),
  )
  const explicitNet =
    row.organizer_net_payout ?? row.organizerNetPayout ?? null
  return roundLedger({
    grossRevenue,
    tokepassServiceCharge,
    organizerNetPayout:
      explicitNet == null ? grossRevenue - tokepassServiceCharge : toMoney(explicitNet as number | string),
  })
}

export function filterPaidRecentSales<T extends { status: string }>(
  sales: T[],
): T[] {
  return sales.filter((sale) => isPaidOrderStatus(sale.status))
}

function formatExportDecimal(value: number | string): string {
  if (typeof value === "number") {
    return formatCentsAsDecimal(moneyToCentsBigInt(value))
  }
  return value
}

function formatExportArs(value: number | string): string {
  if (typeof value === "number") {
    return formatCentsAsArs(moneyToCentsBigInt(value))
  }
  return value
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type OrganizerFinanceExportInput = {
  ledger: OrganizerPaidLedger
  generatedAt?: string
  organizerLabel?: string
  extraRows?: Array<{ label: string; value: number | string }>
}

const LEDGER_CSV_HEADERS = [
  "Concepto",
  "Monto ARS",
  "Fuente",
] as const

export function buildOrganizerFinanceCsv(
  input: OrganizerFinanceExportInput,
): string {
  const cents = paidLedgerToCents(input.ledger)
  const source = "orders.status=paid"
  const rows: string[][] = [
    [
      "Recaudacion bruta (gross_revenue)",
      formatCentsAsDecimal(cents.grossRevenueCents),
      source,
    ],
    [
      "Comision TokePass (tokepass_service_charge)",
      formatCentsAsDecimal(cents.tokepassServiceChargeCents),
      source,
    ],
    [
      "Neto organizador (organizer_net_payout)",
      formatCentsAsDecimal(cents.organizerNetPayoutCents),
      "gross_revenue - tokepass_service_charge",
    ],
  ]
  for (const extra of input.extraRows ?? []) {
    rows.push([extra.label, formatExportDecimal(extra.value), source])
  }
  const body = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
  return [LEDGER_CSV_HEADERS.join(","), ...body].join("\r\n")
}

export function buildOrganizerFinancePdfHtml(
  input: OrganizerFinanceExportInput,
): string {
  const cents = paidLedgerToCents(input.ledger)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const organizer = escapeHtml(input.organizerLabel?.trim() || "Organizador")
  const extra = (input.extraRows ?? [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(formatExportArs(row.value))}</td></tr>`,
    )
    .join("")
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte financiero TokePass</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { color: #444; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; margin-top: 24px; }
    th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
    th { background: #f4f4f5; }
    .muted { font-size: 12px; color: #666; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Libro mayor de recaudacion</h1>
  <p>${organizer}</p>
  <p>Solo ordenes liquidadas (status = paid). Las ordenes pending no se incluyen.</p>
  <table>
    <thead>
      <tr><th>Concepto</th><th>Monto</th></tr>
    </thead>
    <tbody>
      <tr><td>Recaudacion bruta (gross_revenue)</td><td>${escapeHtml(formatCentsAsArs(cents.grossRevenueCents))}</td></tr>
      <tr><td>Comision TokePass (tokepass_service_charge)</td><td>${escapeHtml(formatCentsAsArs(cents.tokepassServiceChargeCents))}</td></tr>
      <tr><td>Neto organizador (organizer_net_payout)</td><td>${escapeHtml(formatCentsAsArs(cents.organizerNetPayoutCents))}</td></tr>
      ${extra}
    </tbody>
  </table>
  <p class="muted">Generado ${escapeHtml(generatedAt)} · Fuente: SUM(orders.total_amount) WHERE status = 'paid'</p>
</body>
</html>`
}

export function organizerFinanceExportFilename(now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const d = String(now.getUTCDate()).padStart(2, "0")
  return `tokepass_finanzas_${y}${m}${d}`
}

export function withUtf8Bom(csvBody: string): string {
  return `\uFEFF${csvBody}`
}
