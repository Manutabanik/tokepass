"use client"

import Image from "next/image"
import { QRCodeSVG } from "qrcode.react"

import type { PrintableTicket } from "@/app/actions/pos"
import { BrandMarkSvg, BRAND_MARK_SRC } from "@/components/shared/brand-logo"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import { ticketBackupCode } from "@/lib/ticket-print"

function ThermalTicket({ ticket }: { ticket: PrintableTicket }) {
  const priceLabel =
    ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null

  return (
    <div className="print-ticket mx-auto max-w-[300px] bg-white p-2 text-center text-black">
      <article className="overflow-hidden print:shadow-none">
        <div className="flex flex-col items-center gap-1 pb-2">
          <span className="size-10 overflow-hidden rounded-lg bg-black">
            <Image
              src={BRAND_MARK_SRC}
              alt="Tokepass"
              width={40}
              height={40}
              className="size-full object-cover"
              priority
            />
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            Tokepass
          </p>
        </div>

        <h1 className="text-base font-black leading-tight tracking-tight text-black">
          {ticket.eventTitle}
        </h1>

        <p className="mt-1 text-[11px] capitalize text-zinc-700">
          {formatEventDay(ticket.eventDate)}
          {" · "}
          {formatEventTime(ticket.eventDate)}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
          {ticket.eventLocation}
        </p>

        <div className="my-3 border-y border-dashed border-zinc-400 py-2">
          <p className="text-sm font-bold text-black">{ticket.tierName}</p>
          {priceLabel ? (
            <p className="mt-0.5 text-lg font-black tabular-nums text-black">
              {priceLabel}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="inline-block bg-white p-1">
            <QRCodeSVG
              value={ticket.qrPayload}
              size={220}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
              className="print-ticket-qr"
            />
          </div>
          <p className="font-mono text-[9px] tracking-wider text-zinc-500">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
        </div>

        <div className="mt-1 space-y-0.5 text-sm">
          <p className="font-semibold text-black">{ticket.holderName}</p>
          {ticket.holderDni ? (
            <p className="text-xs tabular-nums text-zinc-800">
              DNI {ticket.holderDni}
            </p>
          ) : null}
        </div>

        <p className="mt-3 text-[10px] font-medium leading-snug text-zinc-700">
          Conservar este ticket para el ingreso
        </p>
        <p className="mt-1 text-[9px] leading-snug text-zinc-500">
          El primer escaneo en puerta otorga el acceso.
        </p>
      </article>
    </div>
  )
}

function PremiumPassTicket({ ticket }: { ticket: PrintableTicket }) {
  const entryLabel = (ticket.seatingLabel || ticket.tierName).toUpperCase()
  const backup = ticketBackupCode(ticket.id)
  const doorsAt = ticket.doorsOpenAt || ticket.eventDate

  return (
    <div className="print-ticket-pass mx-auto w-full max-w-[28rem] overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-950 shadow-xl print:max-w-none print:rounded-none print:border-zinc-300 print:shadow-none">
      <header className="relative isolate h-40 overflow-hidden bg-zinc-950 sm:h-48">
        {ticket.flyerUrl ? (
          // External event flyers may live outside the Next image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.flyerUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur-md">
          <span className="size-6 overflow-hidden rounded-md">
            <BrandMarkSvg title="Tokepass" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
            Tokepass
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
            Entrada oficial
          </p>
          <h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">
            {ticket.eventTitle}
          </h1>
        </div>
      </header>

      <div className="space-y-4 px-5 py-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Fecha
            </dt>
            <dd className="mt-0.5 font-semibold capitalize text-zinc-950">
              {formatEventDay(doorsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Apertura de puertas
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-zinc-950">
              {formatEventTime(doorsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Asistente
            </dt>
            <dd className="mt-0.5 font-semibold text-zinc-950">
              {ticket.holderName}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Documento
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-zinc-950">
              {ticket.holderDni ? `DNI ${ticket.holderDni}` : "Sin DNI"}
            </dd>
          </div>
        </dl>

        <p className="text-xs leading-snug text-zinc-600">{ticket.eventLocation}</p>

        <div className="rounded-2xl bg-primary px-4 py-3 text-center text-primary-foreground">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
            Categoría / Sector
          </p>
          <p className="mt-1 text-lg font-black tracking-tight">{entryLabel}</p>
          {ticket.tierName && ticket.seatingLabel ? (
            <p className="mt-0.5 text-xs font-semibold opacity-90">
              {ticket.tierName}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative border-t-2 border-dashed border-muted">
        <span
          className="absolute top-0 left-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100 print:bg-white"
          aria-hidden="true"
        />
        <span
          className="absolute top-0 right-0 size-5 translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100 print:bg-white"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-col items-center gap-3 px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          Zona de escaneo
        </p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <QRCodeSVG
            value={ticket.qrPayload}
            size={240}
            level="H"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
            className="print-ticket-qr"
          />
        </div>
        <p className="font-mono text-sm font-semibold tracking-[0.22em] text-zinc-800">
          {backup}
        </p>
      </div>

      <footer className="space-y-3 border-t border-zinc-200 bg-zinc-50 px-5 py-4 print:bg-white">
        <p className="text-xs font-medium leading-relaxed text-zinc-700">
          Presentá este boleto en puerta. El primer escaneo válido otorga el
          ingreso. Conservalo hasta salir del predio.
        </p>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          La entrada es personal. Las transferencias y la reventa solo son
          válidas a través de Tokepass. El organizador es responsable del evento
          y de las condiciones de acceso.
        </p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="size-7 overflow-hidden rounded-md">
              <BrandMarkSvg />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
              Tokepass Secure Pass
            </p>
          </div>
          <p className="font-mono text-[10px] tracking-wider text-zinc-400">
            #{ticket.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
      </footer>
    </div>
  )
}

/**
 * `thermal`: ticket POS 80mm.
 * `pass`: boleto premium para imprimir / guardar PDF desde la billetera.
 * QR = totp_secret crudo (papel) → aceptado en puerta.
 */
export function PrintableTicketView({
  ticket,
  variant = "thermal",
}: {
  ticket: PrintableTicket
  variant?: "thermal" | "pass"
}) {
  if (variant === "pass") {
    return (
      <>
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
          }
        `}</style>
        <PremiumPassTicket ticket={ticket} />
      </>
    )
  }

  return <ThermalTicket ticket={ticket} />
}
