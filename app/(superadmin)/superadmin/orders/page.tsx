import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPlatformMoneyLedger } from "@/app/actions/superadmin"
import { PlatformOrdersLedger } from "@/components/superadmin/platform-orders-ledger"
import { PageHeading } from "@/components/superadmin/page-heading"
import { SuperAdminForbiddenError } from "@/lib/superadmin-errors"
import type { OrderStatus } from "@/types/database"

export const metadata: Metadata = {
  title: "Compras",
}

const ORDER_STATUSES = new Set([
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
  "refund_processing",
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
        : "No se pudo cargar el listado de compras."
  }

  if (errorMessage || !ledger) {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Dinero en movimiento"
          title="Compras de la plataforma"
          description="Acá ves cuánto se cobró, cuánto se queda TokePass y cuánto le corresponde a cada productora."
        />
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-8 text-amber-50">
          <h2 className="text-lg font-bold">No pudimos cargar las compras</h2>
          <p className="mt-2 text-sm text-amber-100/80">
            {errorMessage ?? "Hubo un problema al consultar las compras."}
          </p>
          <p className="mt-4 text-xs text-amber-100/60">
            Si acabás de publicar cambios, asegurate de aplicar las migraciones
            de dinero en Supabase y volvé a intentar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeading
        eyebrow="Dinero en movimiento"
        title="Compras de la plataforma"
        description="Acá ves cuánto se cobró, cuánto se queda TokePass y cuánto le corresponde a cada productora."
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
