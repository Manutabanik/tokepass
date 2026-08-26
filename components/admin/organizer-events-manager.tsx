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
  MoreVertical,
  Pencil,
  Plus,
  Rocket,
  ShieldAlert,
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
import { requestEventCancellationSupport } from "@/app/actions/support"
import { BoostModal } from "@/components/admin/boost-modal"
import { getBoostPlan } from "@/lib/boost-plans"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { canSubmitEventForReview } from "@/lib/events/review-status"
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
        className="h-10 shrink-0 rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-500"
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
  const [supportTarget, setSupportTarget] = useState<OrganizerEvent | null>(null)
  const [pendingDelete, startDelete] = useTransition()
  const [pendingArchive, startArchive] = useTransition()
  const [pendingSupport, startSupport] = useTransition()

  const hint = useMemo(() => {
    if (boostHint === "success") {
      return {
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200",
        text: "Pago de Boost recibido. El destaque se activa al confirmar el webhook de Mercado Pago.",
      }
    }
    if (boostHint === "pending") {
      return {
        className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-200",
        text: "Pago de Boost pendiente. Te avisamos cuando Mercado Pago lo confirme.",
      }
    }
    if (boostHint === "failure") {
      return {
        className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-200",
        text: "No se completó el pago del Boost. Podés reintentarlo desde el evento.",
      }
    }
    return null
  }, [boostHint])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">
            Cartelera
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">
            Mis Eventos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Creá borradores, previsualizá compras de prueba y envialo a
            revisión cuando esté listo.
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
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-400/30">
              <Rocket className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-bold text-foreground">
                Multiplicá tus ventas hasta x3
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Destacá este evento en la portada con TokePass Boost (Silver,
                Gold o Platinum).
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="default"
            className="min-h-11 shrink-0 rounded-xl"
            disabled={events.length === 0}
            onClick={() => {
              const target =
                events.find((event) => event.status === "published") ??
                events[0]
              if (target) setBoostEvent(target)
            }}
          >
            Destacar un evento
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-[1.75rem] border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
          <div>
            <CalendarDays className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 text-lg font-bold text-foreground">Sin eventos aún</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Creá tu primera noche como borrador y previsualizala antes de
              enviarla a revisión.
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
                className="flex flex-col rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between md:gap-6"
              >
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {event.image_url ? (
                      <Image
                        src={event.image_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-muted-foreground">
                        <ImageIcon className="size-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">
                        {event.title}
                      </h2>
                      <EventStatusBadge status={event.status} />
                      {active ? (
                        <Badge className="rounded-full border-0 bg-cyan-400/15 text-cyan-700 dark:text-cyan-200">
                          <Crown className="size-3" aria-hidden="true" />
                          Impulso{" "}
                          {getBoostPlan(event.featured_tier ?? "")?.name ??
                            event.featured_tier}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {formatEventDay(event.date)}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {event.venues?.name ?? event.location?.trim() ?? "Online"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.ticketsSold > 0
                        ? `${event.ticketsSold} entrada${event.ticketsSold === 1 ? "" : "s"} vendida${event.ticketsSold === 1 ? "" : "s"} / comprometidas`
                        : "Sin ventas todavía"}
                    </p>
                    {event.status === "needs_revision" && event.review_note ? (
                      <p className="text-xs leading-5 text-orange-800 dark:text-orange-200">
                        Cambios pedidos: {event.review_note}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex w-full items-center justify-between gap-2 border-t border-border pt-4 md:mt-0 md:w-auto md:shrink-0 md:justify-end md:border-t-0 md:pt-0">
                  {canSubmitEventForReview(event.status) ? (
                    <PublishEventButton eventId={event.id} />
                  ) : null}
                  <Button
                    variant="default"
                    className="h-10 flex-1 rounded-xl px-4 md:flex-none"
                    nativeButton={false}
                    render={<Link href={`/admin/events/${event.id}`} />}
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    Gestionar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Más acciones para ${event.title}`}
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-10 shrink-0 rounded-xl"
                        />
                      }
                    >
                      <MoreVertical className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuLinkItem
                        href={`/events/preview/${event.id}`}
                        render={<Link href={`/events/preview/${event.id}`} />}
                      >
                        <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
                        Previsualizar
                      </DropdownMenuLinkItem>
                      <DropdownMenuLinkItem
                        href={`/admin/events/${event.id}/edit`}
                        render={<Link href={`/admin/events/${event.id}/edit`} />}
                      >
                        <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                        Editar Evento
                      </DropdownMenuLinkItem>
                      <DropdownMenuItem onClick={() => setBoostEvent(event)}>
                        <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
                        {active ? "Renovar Boost" : "Destacar"}
                      </DropdownMenuItem>
                      {event.paidOrderCount === 0 &&
                      (event.status === "published" ||
                        event.status === "draft" ||
                        event.status === "pending_approval" ||
                        event.status === "needs_revision") ? (
                        <DropdownMenuItem
                          disabled={pendingArchive}
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
                          <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
                          Archivar
                        </DropdownMenuItem>
                      ) : null}
                      {event.status !== "cancelled" ? (
                        <>
                          <DropdownMenuSeparator />
                          {event.paidOrderCount > 0 ? (
                            <DropdownMenuItem
                              onClick={() => setSupportTarget(event)}
                            >
                              <ShieldAlert className="size-4" aria-hidden="true" />
                              Solicitar Cancelación a Soporte
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                              onClick={() => setDeleteTarget(event)}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              Eliminar
                            </DropdownMenuItem>
                          )}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <TriangleAlert className="size-4 text-rose-600 dark:text-rose-300" aria-hidden="true" />
              ¿Querés eliminar esto?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {deleteTarget && deleteTarget.ticketsSold > 0
                ? `“${deleteTarget.title}” tiene ventas confirmadas. No se puede eliminar: pedí la cancelación a soporte.`
                : `“${deleteTarget?.title ?? "Este evento"}” no tiene ventas. Se ocultará con un borrado lógico. El historial no se destruye.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-border"
              onClick={() => setDeleteTarget(null)}
            >
              Volver atrás
            </Button>
            <Button
              type="button"
              disabled={
                pendingDelete ||
                !deleteTarget ||
                deleteTarget.ticketsSold > 0
              }
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
                          ? "Quedó oculto (borrado lógico). No se destruyeron filas."
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
                ? "No se puede eliminar"
                : "Eliminar (borrado lógico)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(supportTarget)}
        onOpenChange={(open) => {
          if (!open) setSupportTarget(null)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ShieldAlert className="size-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              Cancelación con ventas cobradas
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {supportTarget
                ? `“${supportTarget.title}” tiene ${supportTarget.paidOrderCount} compra(s) pagada(s). No podés cancelarlo desde el panel. Soporte debe evaluar el reembolso por la pasarela de pago.`
                : "Este evento tiene compras pagadas."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-border"
              onClick={() => setSupportTarget(null)}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={pendingSupport || !supportTarget}
              className="bg-amber-600 text-white hover:bg-amber-500"
              onClick={() => {
                if (!supportTarget) return
                startSupport(async () => {
                  const result = await requestEventCancellationSupport(
                    supportTarget.id,
                  )
                  if (!result.success) {
                    toast.error(result.error)
                    return
                  }
                  toast.success("Solicitud enviada a soporte", {
                    description: "El equipo de TokePass va a revisar la cancelación y los reembolsos.",
                  })
                  setSupportTarget(null)
                })
              }}
            >
              {pendingSupport ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldAlert className="size-4" aria-hidden="true" />
              )}
              Solicitar Cancelación a Soporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
