"use client"

import { CalendarDays, MapPin, Ticket } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useWatch, type Control } from "react-hook-form"

import { formatEventDate, formatTicketPrice } from "@/lib/format"
import {
  AGE_RESTRICTION_LABELS,
  type AgeRestriction,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

function isAgeRestriction(value: unknown): value is AgeRestriction {
  return value === "atp" || value === "16" || value === "18"
}

export function EventLivePreview({
  control,
  categories,
  flyerFile = null,
  existingFlyerUrl = null,
  className,
}: {
  control: Control<EventFormValues>
  categories: Array<{ id: string; name: string }>
  flyerFile?: File | null
  existingFlyerUrl?: string | null
  className?: string
}) {
  const title = useWatch({ control, name: "basics.title" })
  const categoryId = useWatch({ control, name: "basics.categoryId" })
  const ageRestriction = useWatch({ control, name: "basics.ageRestriction" })
  const date = useWatch({ control, name: "basics.date" })
  const endDate = useWatch({ control, name: "basics.endDate" })
  const isMultiDay = useWatch({ control, name: "basics.isMultiDay" })
  const scheduleDays = useWatch({ control, name: "basics.scheduleDays" })
  const venueName = useWatch({ control, name: "venue.venueName" })
  const venueLocation = useWatch({ control, name: "venue.venueLocation" })
  const venueCity = useWatch({ control, name: "venue.venueCity" })
  const tickets = useWatch({ control, name: "tickets" })

  const flyerUrl = useMemo(
    () => (flyerFile ? URL.createObjectURL(flyerFile) : null),
    [flyerFile],
  )
  useEffect(() => {
    return () => {
      if (flyerUrl) URL.revokeObjectURL(flyerUrl)
    }
  }, [flyerUrl])

  const eventTitle = title?.trim() || "Nombre del evento"
  const categoryName =
    categories.find((category) => category.id === categoryId)?.name ?? null
  const ageLabel = isAgeRestriction(ageRestriction)
    ? AGE_RESTRICTION_LABELS[ageRestriction]
    : null

  const firstDay = isMultiDay ? scheduleDays?.[0]?.startTime : date
  const lastDay = isMultiDay
    ? scheduleDays?.[scheduleDays.length - 1]?.endTime ||
      scheduleDays?.[scheduleDays.length - 1]?.startTime
    : endDate
  const when = firstDay?.trim()
    ? lastDay?.trim() && lastDay !== firstDay
      ? `${formatEventDate(firstDay)} – ${formatEventDate(lastDay)}`
      : formatEventDate(firstDay)
    : "Fecha a confirmar"

  const place =
    [venueName, venueLocation, venueCity]
      .map((value) => value?.trim())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join(" · ") || "Lugar a confirmar"

  const visibleTickets = (tickets ?? []).filter(
    (tier) =>
      (tier.name ?? "").trim() ||
      Number(tier.price) > 0 ||
      Number(tier.capacity) > 0,
  )

  return (
    <div
      className={cn(
        "relative mx-auto h-[min(44rem,calc(100dvh-5rem))] w-[min(100%,22.5rem)]",
        className,
      )}
    >
      <div
        className="absolute -left-[3px] top-28 h-8 w-[3px] rounded-l-full bg-zinc-600"
        aria-hidden="true"
      />
      <div
        className="absolute -left-[3px] top-40 h-12 w-[3px] rounded-l-full bg-zinc-600"
        aria-hidden="true"
      />
      <div
        className="absolute -right-[3px] top-36 h-16 w-[3px] rounded-r-full bg-zinc-600"
        aria-hidden="true"
      />

      <div className="absolute inset-0 rounded-[40px] bg-zinc-800 shadow-[0_28px_70px_-18px_rgba(0,0,0,0.72)] ring-1 ring-white/10">
        <div className="absolute inset-[9px] flex flex-col overflow-hidden rounded-[31px] bg-zinc-950">
          <div
            className="pointer-events-none absolute top-3 left-1/2 z-20 h-[22px] w-[7.25rem] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
            aria-hidden="true"
          >
            <span className="absolute top-1/2 right-3 size-2 -translate-y-1/2 rounded-full bg-zinc-800" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative aspect-[4/5] w-full bg-zinc-900">
              {flyerUrl || existingFlyerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob/public flyer
                <img
                  src={flyerUrl ?? existingFlyerUrl ?? ""}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 overflow-hidden">
                  <div className="tokepass-aurora absolute -inset-10 bg-gradient-to-br from-emerald-600/70 via-zinc-900 to-violet-700/70" />
                  <div className="tokepass-aurora tokepass-aurora-magenta absolute -right-8 -bottom-10 size-56 rounded-full bg-fuchsia-600/30 blur-3xl" />
                  <div className="tokepass-aurora tokepass-aurora-cyan absolute -top-8 -left-6 size-48 rounded-full bg-cyan-400/20 blur-3xl" />
                  <div className="absolute inset-0 grid place-items-center">
                    <p className="text-xs font-medium tracking-wide text-zinc-300">
                      Flyer del evento
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/75 to-transparent px-4 pt-20 pb-4">
                <p className="text-[10px] font-semibold tracking-[0.22em] text-emerald-400 uppercase">
                  TokePass
                </p>
                <h2 className="font-heading mt-1 line-clamp-3 text-[1.7rem] leading-[1.08] font-extrabold tracking-tight text-white">
                  {eventTitle}
                </h2>
                {categoryName || ageLabel ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {categoryName ? (
                      <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-100">
                        {categoryName}
                      </span>
                    ) : null}
                    {ageLabel ? (
                      <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        {ageLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 px-4 pt-4 pb-8">
              <p className="flex items-start gap-2 text-sm text-zinc-200">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span className="min-w-0 break-words">{when}</span>
              </p>
              <p className="flex items-start gap-2 text-sm text-zinc-200">
                <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span className="min-w-0 break-words">{place}</span>
              </p>

              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
                  Entradas
                </p>
                {visibleTickets.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-3 text-sm text-zinc-500">
                    Las tarifas aparecen aca en vivo.
                  </div>
                ) : (
                  visibleTickets.map((tier, index) => (
                    <div
                      key={`${tier.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-zinc-100">
                          <Ticket className="size-3.5 shrink-0 text-emerald-400" />
                          {tier.name.trim() || "Entrada"}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {Number(tier.capacity) > 0
                            ? `${tier.capacity} cupos`
                            : "Cupo a definir"}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-white">
                        {formatTicketPrice(Number(tier.price) || 0)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div
            className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-white/25"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}
