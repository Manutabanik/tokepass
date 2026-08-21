import { QRCodeSVG } from "qrcode.react"

import { TokepassPrintWordmark } from "@/components/print/tokepass-print-wordmark"
import { TestTicketWatermark } from "@/components/public/test-ticket-watermark"
import { formatDateTime, formatEventDay, formatEventTime } from "@/lib/format"
import { ticketOrderIdShort, ticketPrintCode } from "@/lib/ticket-print"

export type ThermalAdmissionTicketProps = {
  eventTitle: string
  eventDate: string
  eventLocation: string
  tierName: string
  qrPayload: string
  ticketCode: string
  holderName?: string | null
  holderDni?: string | null
  seatLabel?: string | null
  priceLabel?: string | null
  isTest?: boolean
  flyerUrl?: string | null
  paymentLabel?: string | null
  orderId?: string | null
  issuedAt?: string | null
}

/**
 * Ticket termico 80mm: tipo/sector en recuadro negro, QR central,
 * auditoria y pie TokePass. Solo #000 / #FFF para comanderas.
 */
export function ThermalAdmissionTicket({
  eventTitle,
  eventDate,
  eventLocation,
  tierName,
  qrPayload,
  ticketCode,
  holderName,
  holderDni,
  seatLabel,
  priceLabel,
  isTest = false,
  flyerUrl,
  paymentLabel,
  orderId,
  issuedAt,
}: ThermalAdmissionTicketProps) {
  const dateLabel = eventDate ? formatEventDay(eventDate) : ""
  const timeLabel = eventDate ? formatEventTime(eventDate) : ""
  const venue = eventLocation.trim()
  const code = ticketPrintCode(ticketCode)
  const orderShort = ticketOrderIdShort(orderId)
  const issuedLabel = issuedAt ? formatDateTime(issuedAt) : ""
  const sector = seatLabel?.trim() || ""

  return (
    <article className="relative print-ticket print-ticket-admission">
      {isTest ? <TestTicketWatermark compact /> : null}

      <header className="print-ticket-header">
        {flyerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flyerUrl}
            alt=""
            className="print-ticket-flyer"
          />
        ) : null}
        <h1 className="print-ticket-event-name">{eventTitle}</h1>
      </header>

      <section className="print-ticket-hero">
        <p className="print-ticket-hero-kicker">Tipo de entrada</p>
        <h2 className="print-ticket-hero-tier">{tierName}</h2>
        {sector ? (
          <p className="print-ticket-hero-sector">Sector: {sector}</p>
        ) : null}
      </section>

      <section className="print-ticket-when-block">
        {dateLabel ? <p className="print-ticket-when">{dateLabel}</p> : null}
        {timeLabel ? <p className="print-ticket-time">{timeLabel}</p> : null}
        {venue ? <p className="print-ticket-venue">{venue}</p> : null}
      </section>

      <section className="print-ticket-qr-block">
        <div className="print-qr-quiet">
          <QRCodeSVG
            value={qrPayload}
            size={180}
            level="H"
            includeMargin
            bgColor="#ffffff"
            fgColor="#000000"
            className="print-ticket-qr"
          />
        </div>
        {code ? <p className="print-ticket-code">{code}</p> : null}
      </section>

      <section className="print-ticket-audit">
        <div className="print-ticket-audit-row">
          {priceLabel ? <span>PRECIO: {priceLabel}</span> : null}
          {paymentLabel ? <span>PAGO: {paymentLabel}</span> : null}
        </div>
        <div className="print-ticket-audit-row">
          {holderName ? <span>TITULAR: {holderName}</span> : null}
          {holderDni ? <span>DNI: {holderDni}</span> : null}
        </div>
        {issuedLabel || orderShort ? (
          <p className="print-ticket-audit-meta">
            {issuedLabel ? `EMISION: ${issuedLabel}` : null}
            {issuedLabel && orderShort ? "  " : null}
            {orderShort ? `ID: ${orderShort}` : null}
          </p>
        ) : null}
      </section>

      <footer className="print-ticket-brand-foot">
        <TokepassPrintWordmark className="print-ticket-wordmark" />
        <p className="print-ticket-domain">tokepass.com.ar</p>
        <p className="print-ticket-legal">Boleteria Digital Oficial</p>
      </footer>
    </article>
  )
}
