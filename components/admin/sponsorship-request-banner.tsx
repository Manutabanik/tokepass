"use client"

import { MessageCircle, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

function buildSponsorshipContactHref(eventTitle: string, eventId: string): string {
  const whatsapp = process.env.NEXT_PUBLIC_TOKEPASS_COMMERCIAL_WHATSAPP?.trim()
  const email =
    process.env.NEXT_PUBLIC_TOKEPASS_COMMERCIAL_EMAIL?.trim() ||
    "comercial@tokepass.com.ar"

  const message = [
    "Hola Tokepass, quiero solicitar Auspicio Comercial para mi evento.",
    `Evento: ${eventTitle}`,
    `ID: ${eventId}`,
  ].join("\n")

  if (whatsapp) {
    const digits = whatsapp.replace(/[^\d]/g, "")
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
  }

  return `mailto:${email}?subject=${encodeURIComponent(
    `Solicitud Auspicio Tokepass — ${eventTitle}`,
  )}&body=${encodeURIComponent(message)}`
}

export function SponsorshipRequestBanner({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle: string
}) {
  const href = buildSponsorshipContactHref(eventTitle, eventId)

  return (
    <aside className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] via-zinc-950/80 to-zinc-950 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/90">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Crecimiento
          </p>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white sm:text-xl">
            Destacá tu evento con Auspicio Tokepass
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Aumentá tus ventas promocionando tu evento en los primeros lugares
            de la plataforma.
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4",
            "bg-amber-500 text-sm font-medium text-zinc-950 transition hover:bg-amber-400",
          )}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Solicitar Auspicio Comercial
        </a>
      </div>
    </aside>
  )
}
