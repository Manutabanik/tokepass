"use client"

import { QRCodeSVG } from "qrcode.react"

import type { PrintableTicket } from "@/app/actions/pos"
import { ThermalAdmissionTicket } from "@/components/print/thermal-admission-ticket"
import { TokepassPrintWordmark } from "@/components/print/tokepass-print-wordmark"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"
import { ticketPrintCode } from "@/lib/ticket-print"
import { ticketSectorLabel } from "@/lib/ticket-stub"
import { ticketAdmissionTitle, ticketExactSeatLabel } from "@/lib/ticket-wallet"

function ThermalTicket({ ticket }: { ticket: PrintableTicket }) {
  const priceLabel =
    ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null
  const seatLabel = ticketExactSeatLabel({
    seatingLabel: ticket.seatingLabel,
    tierName: ticket.tierName,
  })

  return (
    <div id="printable-ticket">
      <ThermalAdmissionTicket
        eventTitle={ticket.eventTitle}
        eventDate={ticket.eventDate}
        eventLocation={ticket.eventLocation}
        tierName={ticketAdmissionTitle({
          tierName: ticket.tierName,
          seatingLabel: ticket.seatingLabel,
        })}
        qrPayload={ticket.qrPayload}
        ticketCode={ticket.id}
        holderName={ticket.holderName}
        holderDni={ticket.holderDni}
        seatLabel={seatLabel ? null : ticket.sectorLabel}
        priceLabel={priceLabel}
        isTest={ticket.isTest}
        flyerUrl={ticket.flyerUrl}
      />
    </div>
  )
}

function PremiumPassTicket({ ticket }: { ticket: PrintableTicket }) {
  const admissionTitle = ticketAdmissionTitle({
    tierName: ticket.tierName,
    seatingLabel: ticket.seatingLabel,
  })
  const seatLabel = ticketExactSeatLabel({
    seatingLabel: ticket.seatingLabel,
    tierName: ticket.tierName,
  })
  const sector = ticketSectorLabel({
    seatingSectorName: ticket.sectorLabel,
    seatingLabel: ticket.seatingLabel,
    tierName: ticket.tierName,
  })
  const code = ticketPrintCode(ticket.id)
  const doorsAt = ticket.doorsOpenAt || ticket.eventDate
  const priceLabel =
    ticket.tierPrice != null ? formatCurrency(ticket.tierPrice) : null

  return (
    <div
      className="ticket-print-card print-ticket-pass relative mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-black bg-white text-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {ticket.isTest ? <TestTicketWatermark /> : null}

      <header className="space-y-3 border-b border-black px-5 py-5 text-center">
        {ticket.flyerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.flyerUrl}
            alt=""
            className="h-24 w-full object-cover grayscale contrast-125"
          />
        ) : null}
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tight">
          {ticket.eventTitle}
        </h1>
      </header>

      <div className="space-y-4 px-5 py-5">
        <div className="rounded-lg bg-black px-4 py-3 text-center text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
            Tipo de entrada
          </p>
          <p className="mt-1 text-xl font-black uppercase tracking-wide">
            {admissionTitle}
          </p>
          {!seatLabel && sector && sector !== ticket.tierName.toUpperCase() ? (
            <p className="mt-2 inline-block rounded bg-white px-2 py-0.5 text-xs font-bold uppercase text-black">
              Sector: {sector}
            </p>
          ) : null}
        </div>

        <div className="border-b border-dashed border-black pb-3 text-center">
          <p className="font-bold capitalize">{formatEventDay(ticket.eventDate)}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">
            {formatEventTime(doorsAt)}
          </p>
          <p className="mt-1 text-sm font-medium">{ticket.eventLocation}</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 border-b border-black px-5 py-5">
        <div className="border-2 border-black bg-white p-2">
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
        <p className="font-mono text-sm font-bold tracking-[0.22em]">{code}</p>
      </div>

      <div className="space-y-1 border-b border-dashed border-black px-5 py-4 text-xs font-semibold">
        <div className="flex justify-between gap-3 font-mono">
          {priceLabel ? <span>PRECIO: {priceLabel}</span> : <span />}
          <span>TITULAR: {ticket.holderName}</span>
        </div>
        <p>DNI: {ticket.holderDni ? ticket.holderDni : "Sin DNI"}</p>
      </div>

      <footer className="ticket-print-footer flex flex-col items-center gap-1 px-5 py-4 text-center">
        <TokepassPrintWordmark className="h-6 w-[140px]" />
        <p className="text-[10px] font-bold tracking-wider">tokepass.com.ar</p>
        <p className="text-[8px] font-semibold uppercase tracking-wide">
          Boleteria Digital Oficial
        </p>
      </footer>
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
