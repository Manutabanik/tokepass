"use client"

import {
  Building2,
  ExternalLink,
  IdCard,
  Landmark,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  approveOrganizerKyb,
  rejectOrganizerApplication,
  type OrganizerApplicationRow,
} from "@/app/actions/organizer-kyb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatDate } from "@/lib/format"

export function OrganizerApplicationsPanel({
  applications,
}: {
  applications: OrganizerApplicationRow[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<OrganizerApplicationRow | null>(null)
  const [pending, startTransition] = useTransition()

  function runApprove() {
    if (!selected) return
    startTransition(async () => {
      const result = await approveOrganizerKyb(selected.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Productora aprobada", {
        description: `${selected.company_name} ya puede entrar a Tu Panel.`,
      })
      setSelected(null)
      router.refresh()
    })
  }

  function runReject() {
    if (!selected) return
    startTransition(async () => {
      const result = await rejectOrganizerApplication(selected.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Solicitud rechazada")
      setSelected(null)
      router.refresh()
    })
  }

  if (applications.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No hay solicitudes pendientes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {applications.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <p className="text-lg font-bold text-foreground">{row.company_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.applicantName ?? "Sin nombre"} · {row.applicantEmail}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              CUIT {row.cuit_cuil}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-amber-500/40 bg-amber-500/15 text-[10px] uppercase text-amber-800 dark:text-amber-100"
                >
                  Pendiente
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(row.created_at)}
                </span>
              </div>
              <Button
                type="button"
                className="min-h-12 shrink-0 rounded-xl bg-sky-600 px-4 font-bold text-white hover:bg-sky-500"
                onClick={() => setSelected(row)}
              >
                Revisar
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Productora</th>
              <th className="px-5 py-3 font-medium">Solicitante</th>
              <th className="px-5 py-3 font-medium">CUIT</th>
              <th className="px-5 py-3 font-medium">Fecha</th>
              <th className="px-5 py-3 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-muted/50"
              >
                <td className="min-w-[150px] max-w-[250px] px-5 py-4 font-medium text-foreground">
                  <span className="block truncate">{row.company_name}</span>
                </td>
                <td className="min-w-[150px] max-w-[250px] px-5 py-4 text-muted-foreground">
                  <p className="truncate">{row.applicantName ?? "Sin nombre"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.applicantEmail}
                  </p>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                  {row.cuit_cuil}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatDate(row.created_at)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 border-border bg-transparent text-foreground"
                    onClick={() => setSelected(row)}
                  >
                    Revisar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] gap-0 overflow-y-auto border-border bg-card p-0 text-card-foreground sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
        >
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="size-5 text-violet-600 dark:text-violet-300" />
              {selected?.company_name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Revisá los datos KYB antes de aprobar o rechazar.
            </SheetDescription>
          </SheetHeader>

          {selected ? (
            <div className="space-y-4 px-5 py-5 text-sm">
              <Info
                icon={<IdCard className="size-4" />}
                label="Solicitante"
                value={`${selected.applicantName ?? "—"} · ${selected.applicantEmail}`}
              />
              <Info
                icon={<Landmark className="size-4" />}
                label="CUIT / CUIL"
                value={selected.cuit_cuil}
              />
              <Info
                icon={<IdCard className="size-4" />}
                label="DNI responsable"
                value={selected.responsible_dni}
              />
              <Info
                icon={<Landmark className="size-4" />}
                label="CBU / Alias"
                value={selected.cbu_alias}
              />
              <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Redes / web
                </p>
                <a
                  href={
                    selected.social_media_url.startsWith("http")
                      ? selected.social_media_url
                      : selected.social_media_url.startsWith("@")
                        ? `https://instagram.com/${selected.social_media_url.slice(1)}`
                        : `https://${selected.social_media_url}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex min-h-12 items-center gap-1.5 text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
                >
                  {selected.social_media_url}
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Enviada {formatDate(selected.created_at)}
              </p>
            </div>
          ) : null}

          <SheetFooter className="gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-col">
            <Button
              type="button"
              disabled={pending}
              onClick={runApprove}
              className="min-h-12 w-full bg-emerald-600 font-bold text-white hover:bg-emerald-500"
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ShieldCheck />
              )}
              Aprobar Productora
            </Button>
            <Button
              type="button"
              disabled={pending}
              variant="outline"
              onClick={runReject}
              className="min-h-12 w-full border-rose-500/40 bg-rose-500/15 font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-200"
            >
              <XCircle />
              Rechazar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  )
}
