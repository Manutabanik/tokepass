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
    className: "border-border bg-muted text-muted-foreground",
  },
  pending: {
    label: "Pendiente",
    description: "La productora espera revisión del equipo de plataforma.",
    className: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  },
  approved: {
    label: "Aprobada",
    description: "Puede crear eventos y emitir nuevas entradas.",
    className:
      "border-emerald-400/40 bg-emerald-400/10 text-emerald-800 dark:text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.12)]",
  },
  rejected: {
    label: "Rechazada",
    description: "No puede operar hasta recibir una nueva aprobación.",
    className:
      "border-red-400/40 bg-red-400/10 text-red-700 dark:text-red-200 shadow-[0_0_24px_rgba(248,113,113,0.1)]",
  },
  suspended: {
    label: "Suspendida",
    description: "Creación de eventos y emisión de entradas bloqueadas.",
    className:
      "border-red-500/50 bg-red-500/15 text-red-800 dark:text-red-100 shadow-[0_0_28px_rgba(239,68,68,0.16)]",
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
      accent: "text-violet-700 dark:text-violet-300",
    },
    {
      label: "Entradas vendidas",
      value: formatNumber(organization.metrics.ticketsSold),
      helper: "Entradas confirmadas",
      icon: TicketCheck,
      accent: "text-sky-700 dark:text-sky-300",
    },
    {
      label: "Ventas históricas",
      value: formatCurrency(organization.metrics.historicalGmv),
      helper: "Compras ya pagadas",
      icon: CircleDollarSign,
      accent: "text-emerald-800 dark:text-emerald-300",
    },
  ] as const

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(({ label, value, helper, icon: Icon, accent }) => (
          <Card
            key={label}
            className="border border-border bg-card py-0 text-card-foreground"
          >
            <CardContent className="px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </p>
                  <p className={cn("mt-3 text-3xl font-black", accent)}>
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-white/5 ring-1 ring-border">
                  <Icon className={cn("size-5", accent)} aria-hidden="true" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardHeader className="border-b border-border px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <ShieldAlert className="size-5 text-sky-400" />
                  Estado y ciclo de vida
                </CardTitle>
                <CardDescription className="mt-1 text-muted-foreground">
                  Los cambios se aplican al toque: podés pausar o reactivar a
                  esta productora cuando haga falta.
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
            <p className="rounded-xl border border-border bg-muted dark:bg-black/20 px-4 py-3 text-sm text-muted-foreground">
              {status.description}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                disabled={
                  isPending || organization.profile.status === "approved"
                }
                onClick={() => handleStatusChange("approved")}
                className="h-11 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
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
                className="h-11 bg-amber-500/15 text-amber-800 ring-1 ring-amber-400/30 hover:bg-amber-500/25 dark:text-amber-100"
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
                className="h-11 bg-red-500/15 text-red-800 ring-1 ring-red-400/35 hover:bg-red-500/25 dark:text-red-100"
              >
                <Ban />
                Suspender
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-card to-card py-0">
          <CardHeader className="border-b border-border px-6 py-6">
            <CardTitle className="text-foreground">
              Comisión de la ticketera
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Definí qué porcentaje se queda Tokepass sobre el precio que ve el
              comprador. Se aplica a los eventos nuevos de esta productora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-6 py-6">
            <label
              htmlFor="organizer-fee-rate"
              className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Porcentaje de comisión
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
                className="h-14 border-sky-400/20 bg-background pr-12 font-mono text-2xl font-black text-foreground focus-visible:border-sky-400"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-lg text-sky-700 dark:text-sky-300">
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
                  className="rounded-full border-border bg-muted text-foreground hover:bg-muted hover:text-foreground"
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
