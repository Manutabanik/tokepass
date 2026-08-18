import { QRCodeSVG } from "qrcode.react"

import { formatEventDay, formatEventTime } from "@/lib/format"

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
}

/**
 * Ticket 80mm/58mm: tipo, fecha y recinto en cuerpo gigante.
 * QR SVG 1-bit + quiet zone para pistola térmica.
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
}: ThermalAdmissionTicketProps) {
  const dateLabel = eventDate
    ? `${formatEventDay(eventDate)} ${formatEventTime(eventDate)}`
    : ""
  const venue = eventLocation.trim()
  const code = ticketCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()

  return (
    <article className="print-ticket print-ticket-admission">
      <p className="print-ticket-brand">Tokepass</p>

      <p className="print-ticket-tier">{tierName}</p>
      {seatLabel ? <p className="print-ticket-seat">{seatLabel}</p> : null}
      {dateLabel ? <p className="print-ticket-when">{dateLabel}</p> : null}
      {venue ? <p className="print-ticket-venue">{venue}</p> : null}

      <div className="print-qr-quiet">
        <QRCodeSVG
          value={qrPayload}
          size={232}
          level="H"
          includeMargin
          bgColor="#ffffff"
          fgColor="#000000"
          className="print-ticket-qr"
        />
      </div>

      <p className="print-ticket-event">{eventTitle}</p>
      {holderName ? <p className="print-ticket-holder">{holderName}</p> : null}
      {holderDni ? (
        <p className="print-ticket-dni">DNI {holderDni}</p>
      ) : null}
      {priceLabel ? <p className="print-ticket-price">{priceLabel}</p> : null}
      <p className="print-ticket-code">#{code}</p>
    </article>
  )
}
