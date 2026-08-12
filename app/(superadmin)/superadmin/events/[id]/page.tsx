import {
  ArrowLeft,
  Building2,
  MapPin,
  Ticket,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getMassRefundPreview } from "@/app/actions/superadmin-refunds"
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
  const preview = await getMassRefundPreview(id)

  if (!preview) notFound()

  return (
    <>
      <Link
        href="/superadmin/events"
        className="mb-7 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a eventos
      </Link>

      <PageHeading
        eyebrow="God Mode · Evento"
        title={preview.eventTitle}
        description={`${preview.organizerName} · ${formatDateTime(preview.eventDate)}`}
        actions={<EventStatusBadge status={preview.eventStatus} />}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
              Órdenes pagadas
            </p>
            <p className="mt-3 flex items-center gap-2 text-3xl font-black text-emerald-300">
              <Ticket className="size-6" aria-hidden="true" />
              {formatNumber(preview.paidOrders)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
              Entradas afectadas
            </p>
            <p className="mt-3 text-3xl font-black text-sky-300">
              {formatNumber(preview.validTickets)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardContent className="px-5 py-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
              Exposición financiera
            </p>
            <p className="mt-3 text-3xl font-black text-amber-300">
              {formatCurrency(preview.refundableAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6 border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-6 py-5">
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="size-5 text-violet-300" />
            Productora responsable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-6 py-5 text-sm text-zinc-400">
          <p className="text-base font-medium text-zinc-200">
            {preview.organizerName}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <MapPin className="size-3.5" aria-hidden="true" />
            {preview.eventLocation}
          </p>
          <p className="font-mono text-xs uppercase tracking-wide text-zinc-500">
            Risk tier · {preview.riskTier.replaceAll("_", " ")}
          </p>
          <Link
            href={`/superadmin/organizations/${preview.organizerId}`}
            className="inline-flex text-sm text-sky-300 hover:text-sky-200"
          >
            Abrir gobierno financiero
          </Link>
          <Link
            href={`/admin/events/${id}/settings`}
            className="mt-2 inline-flex text-sm text-violet-300 hover:text-violet-200"
          >
            Settings comerciales del evento
          </Link>
        </CardContent>
      </Card>

      <EventMassRefundDangerZone preview={preview} />
    </>
  )
}
