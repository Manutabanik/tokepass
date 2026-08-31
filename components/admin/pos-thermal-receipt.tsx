"use client"

import type { PosThermalReceipt } from "@/app/actions/pos"
import { ThermalAdmissionTicket } from "@/components/print/thermal-admission-ticket"
import { formatCurrency } from "@/lib/format"
import { ticketAdmissionTitle, ticketExactSeatLabel } from "@/lib/ticket-wallet"

export function PosThermalReceiptStack({
  receipts,
}: {
  receipts: PosThermalReceipt[]
}) {
  if (receipts.length === 0) return null

  return (
    <div
      id="thermal-ticket-print"
      className="thermal-ticket-print"
      aria-hidden="true"
    >
      {receipts.map((receipt) => (
        <ThermalAdmissionTicket
          key={receipt.ticketId}
          eventTitle={receipt.eventTitle}
          eventDate={receipt.eventDate}
          eventLocation={receipt.eventLocation}
          tierName={ticketAdmissionTitle({
            tierName: receipt.tierName,
            seatingLabel: receipt.seatLabel,
          })}
          qrPayload={receipt.qrPayload}
          ticketCode={receipt.ticketId}
          holderName={receipt.holderName}
          holderDni={receipt.holderDni}
          seatLabel={
            ticketExactSeatLabel({
              seatingLabel: receipt.seatLabel,
              tierName: receipt.tierName,
            })
              ? null
              : receipt.seatLabel
          }
          priceLabel={formatCurrency(receipt.total)}
          flyerUrl={receipt.flyerUrl}
          paymentLabel={receipt.paymentLabel}
          orderId={receipt.orderId}
          issuedAt={receipt.issuedAt}
        />
      ))}
    </div>
  )
}
