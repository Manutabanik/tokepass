import {
  ArrowLeft,
  Building2,
  MapPin,
  Settings2,
  Ticket,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getAuditEventDetails } from "@/app/actions/event-audit"
import { getEventCommercialSettings } from "@/app/actions/events"
import { getMassRefundPreview } from "@/app/actions/superadmin-refunds"
import { DoorAccessPinCard } from "@/components/admin/door-access-pin-card"
import { EventCommercialSettingsForm } from "@/components/admin/event-commercial-settings-form"
import { EventAuditActions } from "@/components/superadmin/event-audit-actions"
import { EventStatusBadge } from "@/components/superadmin/badges"
import { EventMassRefundDangerZone } from "@/components/superadmin/event-mass-refund-danger-zone"
import { PageHeading } from "@/components/superadmin/page-heading"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format"

export const metadata: Metadata = {
  title: "Control de evento",
}

export default async function SuperAdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [preview, commercial, audit] = await Promise.all([
    getMassRefundPreview(id),
    getEventCommercialSettings(id),
    getAuditEventDetails(id),
  ])

  if (!preview) notFound()

  return (
    <>
      <Link
        href="/superadmin/events"
        className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a eventos
      </Link>

      <PageHeading
        eyebrow="Control del evento"
        title={preview.eventTitle}
        description={`${preview.organizerName} · ${formatDateTime(preview.eventDate)}`}
        actions={<EventStatusBadge status={preview.eventStatus} />}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link
          href={`/admin/events/${id}/edit`}
          className="inline-flex h-12 min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          Configurar evento
        </Link>
        <Link
          href={`/admin/events/${id}`}
          className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Centro de mando
        </Link>
        <Link
          href={`/admin/events/create?organizerId=${preview.organizerId}`}
          className="inline-flex h-12 min-h-12 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Nuevo evento de esta productora
        </Link>
      </div>

      <div className="mb-6">
        <DoorAccessPinCard eventId={id} eventTitle={preview.eventTitle} />
      </div>

      {preview.eventStatus === "pending_approval" ||
      preview.eventStatus === "needs_revision" ? (
        <Card className="mb-6 border border-sky-500/25 bg-card py-0 text-card-foreground">
          <CardHeader className="border-b border-border px-6 py-5">
            <CardTitle className="text-foreground">Auditoría del evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 py-5">
            {audit ? (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{audit.organizerName}</p>
                <p>{audit.organizerEmail}</p>
                {audit.organizerPhone ? <p>{audit.organizerPhone}</p> : null}
                <p className="mt-2">{audit.location}</p>
              </div>
            ) : null}
            {audit?.reviewNote ? (
              <p className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-950 dark:text-orange-100">
                {audit.reviewNote}
              </p>
            ) : null}
            <EventAuditActions eventId={id} />
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Compras pagadas
            </p>
            <p className="mt-3 flex items-center gap-2 text-3xl font-black text-emerald-800 dark:text-emerald-300">
              <Ticket className="size-6" aria-hidden="true" />
              {formatNumber(preview.paidOrders)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Personas que ya pagaron su entrada
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Entradas en juego
            </p>
            <p className="mt-3 text-3xl font-black text-sky-800 dark:text-sky-300">
              {formatNumber(preview.validTickets)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Entradas válidas que se verían afectadas por un reembolso
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Plata a devolver
            </p>
            <p className="mt-3 text-3xl font-black text-amber-800 dark:text-amber-300">
              {formatCurrency(preview.refundableAmount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monto estimado si anulás todas las compras de este evento
            </p>
          </CardContent>
        </Card>
      </div>

      {commercial ? (
        <div className="mb-6">
          <EventCommercialSettingsForm initial={commercial} />
        </div>
      ) : null}

      <Card className="mb-6 border border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-6 py-5">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="size-5 text-violet-700 dark:text-violet-300" />
            Organizador / Productora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 py-5 text-sm text-muted-foreground">
          <p className="text-base font-medium text-foreground">
            {preview.organizerName}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" />
            {preview.eventLocation}
          </p>
          <p
            className={
              preview.riskTier === "TIER_1_CUSTODY"
                ? "inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-400/20"
                : "inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200 ring-1 ring-amber-400/20"
            }
          >
            {preview.riskTier === "TIER_1_CUSTODY"
              ? "Estado Financiero Seguro"
              : `Nivel de Riesgo: ${preview.riskTier.replaceAll("_", " ")}`}
          </p>
          <Link
            href={`/superadmin/organizations/${preview.organizerId}`}
            className="inline-flex text-sm text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
          >
            Ver finanzas del organizador
          </Link>
        </CardContent>
      </Card>

      <EventMassRefundDangerZone preview={preview} />
    </>
  )
}
