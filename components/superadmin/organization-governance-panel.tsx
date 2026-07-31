"use client"

import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  Save,
  ShieldAlert,
  TicketCheck,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  type OrganizationDetails,
  type OrganizerGovernanceStatus,
  updateOrganizerApprovalStatus,
  updateOrganizerFeeRate,
} from "@/app/actions/superadmin"
import { OrganizerRiskMatrixCard } from "@/components/superadmin/organizer-risk-matrix-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { OrganizerApprovalStatus } from "@/types/database"

const statusPresentation: Record<
  OrganizerApprovalStatus,
  { label: string; description: string; className: string }
> = {
  none: {
    label: "Sin configurar",
    description: "La cuenta todavía no inició el proceso de aprobación.",
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  },
  pending: {
    label: "Pendiente",
    description: "La productora espera revisión del equipo de plataforma.",
    className: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  },
  approved: {
    label: "Aprobada",
    description: "Puede crear eventos y emitir nuevas entradas.",
    className:
      "border-emerald-400/40 bg-emerald-400/10 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.12)]",
  },
  rejected: {
    label: "Rechazada",
    description: "No puede operar hasta recibir una nueva aprobación.",
    className:
      "border-red-400/40 bg-red-400/10 text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.1)]",
  },
  suspended: {
    label: "Suspendida",
    description: "Creación de eventos y emisión de entradas bloqueadas.",
    className:
      "border-red-500/50 bg-red-500/15 text-red-100 shadow-[0_0_28px_rgba(239,68,68,0.16)]",
  },
}

export function OrganizationGovernancePanel({
  organization,
}: {
  organization: OrganizationDetails
}) {
  const router = useRouter()
  const [feePercent, setFeePercent] = useState(
    organization.profile.serviceChargeRate * 100,
  )
  const [isPending, startTransition] = useTransition()
  const status = statusPresentation[organization.profile.status]

  function handleStatusChange(nextStatus: OrganizerGovernanceStatus) {
    const labels: Record<OrganizerGovernanceStatus, string> = {
      approved: "aprobar",
      rejected: "rechazar",
      suspended: "suspender",
    }
    if (
      !window.confirm(
        `¿Confirmás ${labels[nextStatus]} a ${organization.profile.name}?`,
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await updateOrganizerApprovalStatus(
        organization.profile.id,
        nextStatus,
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Estado de la productora actualizado.")
      router.refresh()
    })
  }

  function handleFeeSave() {
    if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 95) {
      toast.error("La comisión debe estar entre 0% y 95%.")
      return
    }

    startTransition(async () => {
      const result = await updateOrganizerFeeRate(
        organization.profile.id,
        feePercent / 100,
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Comisión actualizada a ${feePercent.toFixed(2)}%.`)
      router.refresh()
    })
  }

  const metrics = [
    {
      label: "Eventos creados",
      value: formatNumber(organization.metrics.totalEvents),
      helper: `${formatNumber(organization.metrics.publishedEvents)} publicados`,
      icon: CalendarDays,
      accent: "text-violet-300",
    },
    {
      label: "Entradas vendidas",
      value: formatNumber(organization.metrics.ticketsSold),
      helper: "Tickets confirmados",
      icon: TicketCheck,
      accent: "text-sky-300",
    },
    {
      label: "GMV histórico",
      value: formatCurrency(organization.metrics.historicalGmv),
      helper: "Órdenes pagadas",
      icon: CircleDollarSign,
      accent: "text-emerald-300",
    },
  ] as const

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(({ label, value, helper, icon: Icon, accent }) => (
          <Card
            key={label}
            className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8"
          >
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
                    {label}
                  </p>
                  <p className={cn("mt-3 text-3xl font-black", accent)}>
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">{helper}</p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/8">
                  <Icon className={cn("size-5", accent)} aria-hidden="true" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardHeader className="border-b border-white/8 px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <ShieldAlert className="size-5 text-sky-400" />
                  Estado y ciclo de vida
                </CardTitle>
                <CardDescription className="mt-1 text-zinc-500">
                  Las restricciones se aplican inmediatamente en la base de
                  datos.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn("h-7 px-3 uppercase tracking-wide", status.className)}
              >
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-6 py-6">
            <p className="rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-zinc-400">
              {status.description}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                disabled={
                  isPending || organization.profile.status === "approved"
                }
                onClick={() => handleStatusChange("approved")}
                className="h-11 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
              >
                <CheckCircle2 />
                Aprobar
              </Button>
              <Button
                type="button"
                disabled={
                  isPending || organization.profile.status === "rejected"
                }
                onClick={() => handleStatusChange("rejected")}
                className="h-11 bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30 hover:bg-amber-500/25"
              >
                <XCircle />
                Rechazar
              </Button>
              <Button
                type="button"
                disabled={
                  isPending || organization.profile.status === "suspended"
                }
                onClick={() => handleStatusChange("suspended")}
                className="h-11 bg-red-500/15 text-red-100 ring-1 ring-red-400/35 hover:bg-red-500/25"
              >
                <Ban />
                Suspender
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-sky-500/10 via-white/[0.04] to-white/[0.02] py-0 ring-1 ring-sky-400/20">
          <CardHeader className="border-b border-white/8 px-6 py-6">
            <CardTitle className="text-white">
              Override de comisión · All-In Fee
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Porcentaje retenido por Tokepass sobre el precio público.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-6 py-6">
            <label
              htmlFor="organizer-fee-rate"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
            >
              Comisión personalizada
            </label>
            <div className="relative">
              <Input
                id="organizer-fee-rate"
                type="number"
                min={0}
                max={95}
                step={0.1}
                value={feePercent}
                onChange={(event) => setFeePercent(Number(event.target.value))}
                disabled={isPending}
                className="h-14 border-sky-400/20 bg-black/30 pr-12 font-mono text-2xl font-black text-white focus-visible:border-sky-400"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-lg text-sky-300">
                %
              </span>
            </div>
            <div className="flex gap-2">
              {[10, 12.5, 15].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setFeePercent(preset)}
                  className="rounded-full border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  {preset}%
                </Button>
              ))}
            </div>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleFeeSave}
              className="h-11 w-full bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-[0_0_24px_rgba(14,165,233,0.18)] hover:from-sky-500 hover:to-indigo-500"
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save />
              )}
              Guardar nueva tarifa
            </Button>
          </CardContent>
        </Card>
      </div>

      <OrganizerRiskMatrixCard organization={organization} />
    </div>
  )
}
