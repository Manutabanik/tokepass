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
  approveOrganizerApplication,
  rejectOrganizerApplication,
  type OrganizerApplicationRow,
} from "@/app/actions/organizer-kyb"
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
      const result = await approveOrganizerApplication(selected.id)
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
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto size-8 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-500">
            No hay solicitudes pendientes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/8 text-xs uppercase tracking-wide text-zinc-600">
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
                className="border-b border-white/6 hover:bg-white/[0.025]"
              >
                <td className="px-5 py-4 font-medium text-zinc-100">
                  {row.company_name}
                </td>
                <td className="px-5 py-4 text-zinc-400">
                  <p>{row.applicantName ?? "Sin nombre"}</p>
                  <p className="text-xs text-zinc-600">{row.applicantEmail}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-zinc-400">
                  {row.cuit_cuil}
                </td>
                <td className="px-5 py-4 text-zinc-500">
                  {formatDate(row.created_at)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-transparent text-zinc-200"
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

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className="border-white/10 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-white">
              <Building2 className="size-5 text-violet-300" />
              {selected?.company_name}
            </SheetTitle>
            <SheetDescription className="text-zinc-500">
              Revisá los datos KYB antes de aprobar o rechazar.
            </SheetDescription>
          </SheetHeader>

          {selected ? (
            <div className="mt-6 space-y-4 text-sm">
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
              <div className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-600">
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
                  className="mt-1 inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200"
                >
                  {selected.social_media_url}
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <p className="text-xs text-zinc-600">
                Enviada {formatDate(selected.created_at)}
              </p>
            </div>
          ) : null}

          <SheetFooter className="mt-8 gap-2 sm:flex-col">
            <Button
              type="button"
              disabled={pending}
              onClick={runApprove}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
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
              className="w-full border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
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
    <div className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-600">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-medium text-zinc-200">{value}</p>
    </div>
  )
}
