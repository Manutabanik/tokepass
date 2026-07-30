"use client"

import {
  CalendarDays,
  Crown,
  ImageIcon,
  LayoutDashboard,
  MapPin,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { publishEvent, type OrganizerEvent } from "@/app/actions/events"
import { BoostModal } from "@/components/admin/boost-modal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { isBoostActive } from "@/lib/services/events-service"
import { formatEventDay } from "@/lib/format"
import { cn } from "@/lib/utils"

function PublishEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
      onClick={() => {
        startTransition(async () => {
          const result = await publishEvent(eventId)
          if (!result.success) {
            toast.error(result.error)
            return
          }
          toast.success("Evento publicado", {
            description: "Ya es visible en el catálogo y acepta compras.",
          })
          router.refresh()
        })
      }}
    >
      {pending ? "Publicando…" : "Publicar evento"}
    </Button>
  )
}

export function OrganizerEventsManager({
  events,
  boostHint,
}: {
  events: OrganizerEvent[]
  boostHint?: "success" | "pending" | "failure" | null
}) {
  const [boostEvent, setBoostEvent] = useState<OrganizerEvent | null>(null)

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
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
            Mis eventos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Publicá, gestioná y multiplicá ventas con Tokepass Boost en la
            portada B2C.
          </p>
        </div>
        <Button
          className="h-11 rounded-full bg-violet-600 text-white hover:bg-violet-500"
          nativeButton={false}
          render={<Link href="/admin/events/create" />}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo evento
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
              <p className="font-bold text-white">
                Multiplicá tus ventas hasta x3
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Destacá este evento en la portada con Tokepass Boost (Silver,
                Gold o Platinum).
              </p>
            </div>
          </div>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/50 px-6 py-12 text-center">
          <div>
            <CalendarDays className="mx-auto size-8 text-zinc-600" />
            <p className="mt-4 text-lg font-bold text-white">Sin eventos aún</p>
            <p className="mt-2 text-sm text-zinc-500">
              Creá tu primera noche y después podés boostearla en la home.
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
                className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 sm:flex-row sm:items-center"
              >
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
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
                    <h2 className="truncate text-base font-bold text-white">
                      {event.title}
                    </h2>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full border-zinc-700 text-[10px] uppercase",
                        event.status === "published" &&
                          "border-emerald-500/40 text-emerald-200",
                        event.status === "draft" &&
                          "border-amber-500/40 text-amber-100",
                      )}
                    >
                      {event.status}
                    </Badge>
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
                </div>

                <div className="mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0 sm:max-w-[360px] sm:justify-end">
                  {event.status === "draft" ? (
                    <PublishEventButton eventId={event.id} />
                  ) : null}
                  <Button
                    className="h-10 rounded-xl border border-zinc-700/80 bg-zinc-800 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-700"
                    nativeButton={false}
                    render={<Link href={`/admin/events/${event.id}`} />}
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    Gestionar
                  </Button>
                  <Button
                    className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-sm font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
                    nativeButton={false}
                    render={<Link href={`/admin/events/${event.id}/edit`} />}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-cyan-400/30 bg-cyan-400/10 px-4 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)] hover:bg-cyan-400/20"
                    onClick={() => setBoostEvent(event)}
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                    {active ? "Renovar Boost" : "Destacar en portada"}
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
    </div>
  )
}
