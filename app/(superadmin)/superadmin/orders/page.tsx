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

  let ledger: Awaited<ReturnType<typeof getPlatformMoneyLedger>>

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
    throw error
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
