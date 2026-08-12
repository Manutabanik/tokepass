import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPlatformMoneyLedger } from "@/app/actions/superadmin"
import { PlatformOrdersLedger } from "@/components/superadmin/platform-orders-ledger"
import { PageHeading } from "@/components/superadmin/page-heading"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { OrderStatus } from "@/types/database"

export const metadata: Metadata = {
  title: "Money Ledger · Órdenes",
}

const ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
])

export default async function SuperAdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    organizerId?: string
    eventId?: string
    status?: string
  }>
}) {
  const params = await searchParams
  const organizerId = params.organizerId?.trim() || ""
  const eventId = params.eventId?.trim() || ""
  const rawStatus = params.status?.trim() || "all"
  const status =
    rawStatus === "all" || ORDER_STATUSES.has(rawStatus)
      ? (rawStatus as OrderStatus | "all")
      : "all"

  let ledger: Awaited<ReturnType<typeof getPlatformMoneyLedger>> | null = null
  let errorMessage: string | null = null

  try {
    ledger = await getPlatformMoneyLedger({
      organizerId: organizerId || null,
      eventId: eventId || null,
      status,
    })
  } catch (error) {
    if (error instanceof SuperAdminForbiddenError) {
      redirect("/")
    }
    errorMessage =
      error instanceof Error
        ? error.message
        : "No se pudo cargar el ledger de órdenes."
  }

  if (errorMessage || !ledger) {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Platform Money Ledger"
          title="Auditoría de órdenes"
          description="Desglose soberano All-In: bruto cobrado, comisión Tokepass y neto a liquidar por productora."
        />
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-8 text-amber-50">
          <h2 className="text-lg font-bold">Ledger no disponible</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            {errorMessage ?? "Error desconocido al consultar órdenes."}
          </p>
          <p className="mt-4 text-xs text-amber-100/60">
            Si acabás de desplegar, aplicá la migración P25 en Supabase (fix del
            RPC <code className="font-mono">get_platform_orders_ledger</code>).
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeading
        eyebrow="Platform Money Ledger"
        title="Auditoría de órdenes"
        description="Desglose soberano All-In: bruto cobrado, comisión Tokepass y neto a liquidar por productora."
      />

      <PlatformOrdersLedger
        rows={ledger.rows}
        totals={ledger.totals}
        organizers={ledger.filterOptions.organizers}
        events={ledger.filterOptions.events}
        filters={{
          organizerId,
          eventId,
          status,
        }}
      />
    </>
  )
}
