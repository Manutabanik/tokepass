"use client"

import { QRCodeSVG } from "qrcode.react"

import type { PosThermalReceipt } from "@/app/actions/pos"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"

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
        <article
          key={receipt.ticketId}
          className="print-ticket mx-auto max-w-[300px] bg-white p-2 font-mono text-center text-black"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
            Tokepass POS
          </p>
          <h1 className="mt-1 text-base font-black leading-tight tracking-tight">
            {receipt.eventTitle}
          </h1>
          <p className="mt-1 text-[11px] capitalize text-zinc-700">
            {receipt.eventDate
              ? `${formatEventDay(receipt.eventDate)} · ${formatEventTime(receipt.eventDate)}`
              : ""}
          </p>
          {receipt.eventLocation ? (
            <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
              {receipt.eventLocation}
            </p>
          ) : null}
          <div className="my-2 border-y border-dashed border-zinc-400 py-2">
            <p className="text-sm font-bold">{receipt.tierName}</p>
            {receipt.seatLabel ? (
              <p className="mt-0.5 text-[11px] font-semibold">{receipt.seatLabel}</p>
            ) : null}
            <p className="mt-1 text-lg font-black tabular-nums">
              {formatCurrency(receipt.total)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 py-1">
            <QRCodeSVG
              value={receipt.qrPayload}
              size={220}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
              className="print-ticket-qr"
            />
            <p className="text-[9px] tracking-wider text-zinc-500">
              #{receipt.ticketId.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <p className="mt-1 text-sm font-semibold">{receipt.holderName}</p>
          {receipt.holderDni ? (
            <p className="text-xs tabular-nums text-zinc-800">
              DNI {receipt.holderDni}
            </p>
          ) : null}
          <p className="mt-2 text-[9px] text-zinc-500">
            Conservar este ticket para el ingreso
          </p>
        </article>
      ))}
    </div>
  )
}
