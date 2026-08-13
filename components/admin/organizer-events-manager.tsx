"use client"

import {
  Archive,
  CalendarDays,
  Crown,
  Eye,
  ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  archiveEvent,
  deleteOrArchiveEvent,
  type OrganizerEvent,
} from "@/app/actions/events"
import { BoostModal } from "@/components/admin/boost-modal"
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import { EventStatusBadge } from "@/components/superadmin/badges"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isBoostActive } from "@/lib/services/events-service"
import { formatEventDay } from "@/lib/format"
import { cn } from "@/lib/utils"

function PublishEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        className="h-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
        onClick={() => setOpen(true)}
      >
        <Rocket className="size-4" aria-hidden="true" />
        Publicar
      </Button>
      <PublishEventConfirmDialog
        eventId={eventId}
        open={open}
        onOpenChange={setOpen}
        onPublished={() => router.refresh()}
      />
    </>
  )
}

export function OrganizerEventsManager({
  events,
  boostHint,
}: {
  events: OrganizerEvent[]
  boostHint?: "success" | "pending" | "failure" | null
}) {
  const router = useRouter()
  const [boostEvent, setBoostEvent] = useState<OrganizerEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrganizerEvent | null>(null)
  const [pendingDelete, startDelete] = useTransition()
  const [pendingArchive, startArchive] = useTransition()

  const hint = useMemo(() => {
    if (boostHint === "success") {
      return {
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
        text: "Pago de Boost recibido. El destaque se activa al confirmar el webhook de Mercado Pago.",
      }
    }
    if (boostHint === "pending") {
      return {
        className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        text: "Pago de Boost pendiente. Te avisamos cuando Mercado Pago lo confirme.",
      }
    }
    if (boostHint === "failure") {
      return {
        className: "border-red-500/30 bg-red-500/10 text-red-100",
        text: "No se completó el pago del Boost. Podés reintentarlo desde el evento.",
      }
    }
    return null
  }, [boostHint])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
            Cartelera
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
            Mis Eventos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Creá borradores, previsualizá compras de prueba y publicá cuando
            esté listo.
          </p>
        </div>
        <Button
          className="min-h-12 h-12 rounded-full bg-violet-600 text-base text-white hover:bg-violet-500"
          nativeButton={false}
          render={<Link href="/admin/events/create" />}
        >
          <Plus className="size-5" aria-hidden="true" />
          Nuevo Evento
        </Button>
      </div>

      {hint ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            hint.className,
          )}
        >
          {hint.text}
        </div>
      ) : null}

      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/5 to-transparent px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30">
              <Rocket className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold text-zinc-900 dark:text-white">
                Multiplicá tus ventas hasta x3
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Destacá este evento en la portada con Tokepass Boost (Silver,
                Gold o Platinum).
              </p>
            </div>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-[1.75rem] border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-6 py-12 text-center">
          <div>
            <CalendarDays className="mx-auto size-8 text-zinc-600" />
            <p className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">Sin eventos aún</p>
            <p className="mt-2 text-sm text-zinc-500">
              Creá tu primera noche como borrador y previsualizala antes de
              publicar.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((event) => {
            const active = isBoostActive({
              isFeatured: event.is_featured,
              featuredUntil: event.featured_until,
            })
            return (
              <article
                key={event.id}
                className="flex flex-col gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-4 sm:flex-row sm:items-center"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
                  {event.image_url ? (
                    <Image
                      src={event.image_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-zinc-600">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-zinc-900 dark:text-white">
                      {event.title}
                    </h2>
                    <EventStatusBadge status={event.status} />
                    {active ? (
                      <Badge className="rounded-full border-0 bg-cyan-400/15 text-cyan-200">
                        <Crown className="size-3" aria-hidden="true" />
                        Boost {event.featured_tier}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-zinc-500">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {formatEventDay(event.date)}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-zinc-500">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {event.venues?.name ?? event.location}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {event.ticketsSold > 0
                      ? `${event.ticketsSold} entrada${event.ticketsSold === 1 ? "" : "s"} vendida${event.ticketsSold === 1 ? "" : "s"} / comprometidas`
                      : "Sin ventas todavía"}
                  </p>
                </div>

                <div className="mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:max-w-[420px] sm:justify-end">
                  <Button
                    className="h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-medium text-amber-100 hover:bg-amber-500/20"
                    nativeButton={false}
                    render={
                      <Link href={`/events/preview/${event.id}`} />
                    }
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Previsualizar
                  </Button>
                  {event.status === "draft" ? (
                    <PublishEventButton eventId={event.id} />
                  ) : null}
                  <Button
                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700/80 bg-zinc-100 dark:bg-zinc-800 px-4 text-sm font-medium text-zinc-900 dark:text-white shadow-sm transition-all hover:bg-zinc-700"
                    nativeButton={false}
                    render={<Link href={`/admin/events/${event.id}`} />}
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    Gestionar
                  </Button>
                  <Button
                    className="h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
                    nativeButton={false}
                    render={<Link href={`/admin/events/${event.id}/edit`} />}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar
                  </Button>
                  {event.status === "published" || event.status === "draft" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pendingArchive}
                      className="h-10 rounded-xl border-zinc-300 dark:border-zinc-700 bg-transparent px-4 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      onClick={() => {
                        startArchive(async () => {
                          const result = await archiveEvent(event.id)
                          if (!result.success) {
                            toast.error(result.error)
                            return
                          }
                          toast.success("Evento archivado")
                          router.refresh()
                        })
                      }}
                    >
                      <Archive className="size-4" aria-hidden="true" />
                      Archivar
                    </Button>
                  ) : null}
                  {event.status !== "cancelled" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-red-500/30 bg-red-500/10 px-4 text-red-200 hover:bg-red-500/20"
                      onClick={() => setDeleteTarget(event)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Eliminar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-cyan-400/30 bg-cyan-400/10 px-4 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)] hover:bg-cyan-400/20"
                    onClick={() => setBoostEvent(event)}
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                    {active ? "Renovar Boost" : "Destacar"}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {boostEvent ? (
        <BoostModal
          open={Boolean(boostEvent)}
          onOpenChange={(open) => {
            if (!open) setBoostEvent(null)
          }}
          eventId={boostEvent.id}
          eventTitle={boostEvent.title}
        />
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
              <TriangleAlert className="size-4 text-red-300" aria-hidden="true" />
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription className="text-zinc-600 dark:text-zinc-400">
              {deleteTarget && deleteTarget.ticketsSold > 0
                ? `“${deleteTarget.title}” tiene ${deleteTarget.ticketsSold} entrada(s) vendidas o en compra. Se marcará como cancelado para preservar la auditoría financiera.`
                : `“${deleteTarget?.title ?? "Este evento"}” no tiene ventas. Se eliminará de forma permanente.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-zinc-300 dark:border-zinc-700"
              onClick={() => setDeleteTarget(null)}
            >
              Abortar
            </Button>
            <Button
              type="button"
              disabled={pendingDelete || !deleteTarget}
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => {
                if (!deleteTarget) return
                startDelete(async () => {
                  const result = await deleteOrArchiveEvent(deleteTarget.id)
                  if (!result.success) {
                    toast.error(result.error)
                    return
                  }
                  toast.success(
                    result.mode === "deleted"
                      ? "Evento eliminado"
                      : "Evento cancelado",
                    {
                      description:
                        result.mode === "deleted"
                          ? "Se borró de la base de datos."
                          : "Quedó cancelado para proteger el historial de ventas.",
                    },
                  )
                  setDeleteTarget(null)
                  router.refresh()
                })
              }}
            >
              {pendingDelete ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {deleteTarget && deleteTarget.ticketsSold > 0
                ? "Cancelar evento"
                : "Eliminar definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
