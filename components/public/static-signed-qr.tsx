"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { generateStaticQrPayload } from "@/lib/totp-offline"
import { cn } from "@/lib/utils"

/**
 * QR de papel / wallet / evento estatico: TPS.ticketId.mac
 * Nunca dibuja totp_secret en claro.
 */
export function StaticSignedQR({
  ticketId,
  totpSecret,
  size = 220,
  className,
}: {
  ticketId: string
  totpSecret: string
  size?: number
  className?: string
}) {
  const [payload, setPayload] = useState("")

  useEffect(() => {
    let cancelled = false
    void generateStaticQrPayload(ticketId, totpSecret)
      .then((next) => {
        if (!cancelled) setPayload(next)
      })
      .catch((error) => {
        console.warn("[static-qr] generate failed", error)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, totpSecret])

  return (
    <div
      className={cn(
        "pointer-events-none mx-auto aspect-square w-full max-w-sm select-none rounded-[1.35rem] bg-white p-4 shadow-sm",
        className,
      )}
    >
      {payload ? (
        <QRCodeSVG
          value={payload}
          size={size}
          level="H"
          bgColor="#ffffff"
          fgColor="#000000"
          className="mx-auto h-full w-full bg-white"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-100" />
      )}
    </div>
  )
}
