"use client"

import { CalendarDays, Mail, MapPin, Phone } from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"

import type { AuditEventRow } from "@/app/actions/event-audit"
import { EventAuditActions } from "@/components/superadmin/event-audit-actions"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function whatsappHref(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, "")
  if (digits.length < 8) return null
  return `https://wa.me/${digits}`
}

function AuditDetail({ event }: { event: AuditEventRow }) {
  const flyer = event.flyerUrl || event.imageUrl
  const wa = whatsappHref(event.organizerPhone)

  return (
    <div className="space-y-5">
      <div className="relative min-h-48 overflow-hidden rounded-xl bg-muted">
        {flyer ? (
          <Image
            src={flyer}
            alt={`Flyer de ${event.title}`}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 28rem, 100vw"
          />
        ) : (
          <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
            Sin flyer
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          {event.title}
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          {formatDateTime(event.date)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {event.location?.trim() || "Online"}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="font-semibold text-foreground">{event.organizerName}</p>
        <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <a href={`mailto:${event.organizerEmail}`} className="hover:text-foreground">
            {event.organizerEmail}
          </a>
        </p>
        {event.organizerPhone ? (
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                {event.organizerPhone}
              </a>
            ) : (
              event.organizerPhone
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Sin WhatsApp cargado</p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Tipos de entrada
        </p>
        {event.tiers.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm">
            {event.tiers.map((tier) => (
              <li
                key={`${event.id}-${tier.name}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <span className="truncate text-foreground">{tier.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatCurrency(tier.price)} · {tier.capacity} cupos
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Sin tipos de entrada.</p>
        )}
      </div>
      <EventAuditActions eventId={event.id} />
    </div>
  )
}

export function EventAuditWorkbench({
  events,
  autoSelectFirst = true,
}: {
  events: AuditEventRow[]
  autoSelectFirst?: boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    autoSelectFirst ? (events[0]?.id ?? null) : null,
  )
  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0] ?? null,
    [events, selectedId],
  )

  if (events.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          No hay eventos pendientes de auditoría.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        {events.map((event) => {
          const active = selected?.id === event.id
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedId(event.id)}
              className={cn(
                "w-full rounded-xl border px-4 py-3 text-left transition",
                active
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <p className="truncate font-semibold text-foreground">{event.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {event.organizerName} · {formatDateTime(event.date)}
              </p>
            </button>
          )
        })}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        {selected ? <AuditDetail event={selected} /> : null}
      </div>
    </div>
  )
}
