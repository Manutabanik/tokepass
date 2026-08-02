"use client"

import Image from "next/image"
import { QRCodeSVG } from "qrcode.react"

import type { PrintableTicket } from "@/app/actions/pos"
import { BRAND_MARK_SRC } from "@/components/shared/brand-logo"
import { formatEventDay, formatEventTime } from "@/lib/format"

export function PrintableTicketView({ ticket }: { ticket: PrintableTicket }) {
  return (
    <div className="print-ticket mx-auto max-w-[420px] bg-white text-zinc-950">
      <article className="overflow-hidden rounded-2xl border border-zinc-200 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-zinc-200 bg-zinc-950 px-6 py-5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="size-8 overflow-hidden rounded-lg bg-black ring-1 ring-white/15">
              <Image
                src={BRAND_MARK_SRC}
                alt=""
                width={32}
                height={32}
                className="size-full object-cover"
              />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">
              Tokepass
            </p>
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight">
            {ticket.eventTitle}
          </h1>
        </header>

        <div className="space-y-5 px-6 py-6">
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-zinc-100 pb-2">
              <dt className="text-zinc-500">Fecha</dt>
              <dd className="text-right font-semibold capitalize">
                {formatEventDay(ticket.eventDate)}
                <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                  {formatEventTime(ticket.eventDate)}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-zinc-100 pb-2">
              <dt className="text-zinc-500">Lugar</dt>
              <dd className="max-w-[60%] text-right font-semibold">
                {ticket.eventLocation}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-zinc-100 pb-2">
              <dt className="text-zinc-500">Titular</dt>
              <dd className="text-right font-semibold">{ticket.holderName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Tipo</dt>
              <dd className="text-right font-semibold">{ticket.tierName}</dd>
            </div>
          </dl>

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6">
            <QRCodeSVG
              value={ticket.qrPayload}
              size={240}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#09090b"
            />
            <p className="font-mono text-[10px] tracking-wider text-zinc-500">
              #{ticket.id.slice(0, 8).toUpperCase()}
            </p>
          </div>

          <p className="text-center text-[11px] leading-5 text-zinc-500">
            Este código QR es único. El primer escaneo en puerta le otorgará el
            acceso y congelará la entrada para evitar duplicados.
          </p>
        </div>
      </article>
    </div>
  )
}
