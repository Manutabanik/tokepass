"use client"

import { CalendarDays, Mail, MapPin, Phone } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { AuditEventRow } from "@/app/actions/event-audit"
import { EventAuditActions } from "@/components/superadmin/event-audit-actions"
import { formatCurrency, formatDateTime } from "@/lib/format"

function whatsappHref(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d]/g, "")
  if (digits.length < 8) return null
  return `https://wa.me/${digits}`
}

function AuditEventCard({
  event,
}: {
  event: AuditEventRow
}) {
  const flyer = event.flyerUrl || event.imageUrl
  const wa = whatsappHref(event.organizerPhone)

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
      <div className="grid gap-0 lg:grid-cols-[16rem_1fr]">
        <div className="relative min-h-44 bg-muted lg:min-h-full">
          {flyer ? (
            <Image
              src={flyer}
              alt={`Flyer de ${event.title}`}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 16rem, 100vw"
            />
          ) : (
            <div className="grid h-full min-h-44 place-items-center text-sm text-muted-foreground">
              Sin flyer
            </div>
          )}
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href={`/superadmin/events/${event.id}`}
                className="text-xl font-black tracking-tight text-foreground hover:text-primary"
              >
                {event.title}
              </Link>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {formatDateTime(event.date)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {event.location}
              </p>
            </div>
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
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground"
                  >
                    {event.organizerPhone}
                  </a>
                ) : (
                  event.organizerPhone
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Sin WhatsApp cargado
              </p>
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
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="truncate text-foreground">{tier.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatCurrency(tier.price)} · {tier.capacity} cupos
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Sin tipos de entrada.
              </p>
            )}
          </div>

          {event.reviewNote ? (
            <p className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-950 dark:text-orange-100">
              Nota previa: {event.reviewNote}
            </p>
          ) : null}

          <EventAuditActions eventId={event.id} />
        </div>
      </div>
    </article>
  )
}

export function EventAuditPanel({
  pending,
  revision,
}: {
  pending: AuditEventRow[]
  revision: AuditEventRow[]
}) {
  if (pending.length === 0 && revision.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 text-center">
        <div>
          <CalendarDays className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No hay eventos esperando auditoría.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">
          Pendientes de aprobación
        </h2>
        {pending.length > 0 ? (
          <div className="grid gap-4">
            {pending.map((event) => (
              <AuditEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ningún evento espera aprobación ahora.
          </p>
        )}
      </section>

      {revision.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">
            Esperando cambios del organizador
          </h2>
          <div className="grid gap-4">
            {revision.map((event) => (
              <AuditEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
