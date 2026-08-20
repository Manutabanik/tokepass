"use client"

import { QRCodeSVG } from "qrcode.react"

import type { PrintableTicket } from "@/app/actions/pos"
import { ThermalAdmissionTicket } from "@/components/print/thermal-admission-ticket"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { BrandMarkSvg } from "@/components/shared/brand-logo"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import { ticketBackupCode } from "@/lib/ticket-print"
import { ticketSectorLabel } from "@/lib/ticket-stub"

function ThermalTicket({ ticket }: { ticket: PrintableTicket }) {
  const priceLabel =
    ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null

  return (
    <ThermalAdmissionTicket
      eventTitle={ticket.eventTitle}
      eventDate={ticket.eventDate}
      eventLocation={ticket.eventLocation}
      tierName={ticket.tierName}
      qrPayload={ticket.qrPayload}
      ticketCode={ticket.id}
      holderName={ticket.holderName}
      holderDni={ticket.holderDni}
      seatLabel={ticket.sectorLabel}
      priceLabel={priceLabel}
      isTest={ticket.isTest}
    />
  )
}

function PremiumPassTicket({ ticket }: { ticket: PrintableTicket }) {
  const sector = ticketSectorLabel({
    seatingSectorName: ticket.sectorLabel,
    seatingLabel: ticket.seatingLabel,
    tierName: ticket.tierName,
  })
  const backup = ticketBackupCode(ticket.id)
  const doorsAt = ticket.doorsOpenAt || ticket.eventDate

  return (
    <div
      className="ticket-print-card print-ticket-pass relative mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-zinc-950 print:bg-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {ticket.isTest ? <TestTicketWatermark /> : null}
      <div className="ticket-print-banner relative isolate h-44 overflow-hidden bg-black print:h-auto print:bg-transparent">
        {ticket.flyerUrl ? (
          // External event flyers may live outside the Next image allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.flyerUrl}
            alt=""
            className="absolute inset-0 size-full object-cover print:hidden"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10 print:hidden" />
        <div className="absolute top-3 right-3 size-8 overflow-hidden rounded-md print:relative print:top-auto print:right-auto print:mx-5 print:mt-3 print:mb-1">
          <BrandMarkSvg title="TokePass" />
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <h1 className="text-2xl font-black leading-tight tracking-tight text-zinc-950">
          {ticket.eventTitle}
        </h1>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              Fecha
            </dt>
            <dd className="mt-0.5 font-semibold capitalize text-zinc-950">
              {formatEventDay(ticket.eventDate)}
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
        </dl>
        <p className="text-sm font-medium leading-snug text-zinc-700">
          {ticket.eventLocation}
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            Asistente
          </p>
          <p className="mt-0.5 text-sm font-bold text-zinc-950">
            {ticket.holderName}
          </p>
          <p className="text-sm font-bold tabular-nums text-zinc-950">
            {ticket.holderDni ? `DNI ${ticket.holderDni}` : "Sin DNI"}
          </p>
        </div>

        <div className="rounded-none bg-black px-4 py-3 text-center text-white print:border-2 print:border-black print:bg-white print:text-black">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 print:text-zinc-600">
            Categoría
          </p>
          <p className="mt-1 text-lg font-black tracking-tight">{sector}</p>
          {ticket.seatingLabel ? (
            <p className="mt-0.5 text-xs font-semibold text-white/80 print:text-zinc-700">
              {ticket.seatingLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="stub-divider" aria-hidden="true" />

      <div className="flex flex-col items-center gap-3 px-5 py-5">
        <div className="rounded-none border-0 bg-white p-0">
          <QRCodeSVG
            value={ticket.qrPayload}
            size={200}
            level="H"
            includeMargin
            bgColor="#ffffff"
            fgColor="#000000"
            className="ticket-stub-qr"
          />
        </div>
        <p className="font-mono text-sm font-semibold tracking-[0.22em] text-zinc-800">
          {backup}
        </p>
      </div>

      <div className="ticket-print-footer border-t border-slate-200 px-5 py-4 text-center">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-600">
          Entrada Oficial Nominada | TokePass Boletería Digital
        </p>
      </div>
    </div>
  )
}

/**
 * `thermal`: ticket POS 80mm.
 * `pass`: boleto premium para imprimir / guardar PDF desde la billetera.
 * QR = TPS firmado (papel) o Living QR en pantalla.
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
            @page { size: A4 portrait; margin: 0.5cm; }
          }
        `}</style>
        <PremiumPassTicket ticket={ticket} />
      </>
    )
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
      <ThermalTicket ticket={ticket} />
    </>
  )
}
