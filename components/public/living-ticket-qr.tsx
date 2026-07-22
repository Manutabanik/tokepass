"use client"

import { ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { Progress } from "@/components/ui/progress"
import {
  generateLivingQrPayload,
  getTotpWindow,
  getTotpWindowProgress,
} from "@/lib/totp-offline"
import { cn } from "@/lib/utils"

/**
 * Living QR offline-capable: HMAC(totp_secret, ticketId:window) — sin filtrar la semilla.
 */
export function LivingTicketQR({
  ticketId,
  totpSecret,
  className,
}: {
  ticketId: string
  totpSecret?: string
  className?: string
}) {
  const secret = totpSecret || ticketId
  const [token, setToken] = useState("")
  const [progress, setProgress] = useState(() => getTotpWindowProgress())

  useEffect(() => {
    let cancelled = false
    let lastWindow = getTotpWindow()

    async function refreshToken() {
      try {
        const next = await generateLivingQrPayload(ticketId, secret)
        if (!cancelled) setToken(next)
      } catch (error) {
        console.warn("[living-qr] generate failed", error)
      }
    }

    void refreshToken()

    const intervalId = window.setInterval(() => {
      const currentWindow = getTotpWindow()
      setProgress(getTotpWindowProgress())

      if (currentWindow !== lastWindow) {
        lastWindow = currentWindow
        void refreshToken()
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [ticketId, secret])

  return (
    <div className={cn("mx-auto w-full max-w-[260px] text-center", className)}>
      <div className="relative mx-auto grid place-items-center">
        <div className="absolute inset-0 rounded-[1.75rem] bg-emerald-400/15 blur-2xl" />
        <div className="relative rounded-[1.35rem] bg-white p-3.5 shadow-[0_0_32px_rgba(255,255,255,0.08)]">
          {token ? (
            <QRCodeSVG
              value={token}
              size={208}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#09090b"
              className="mx-auto"
            />
          ) : (
            <div className="size-[208px] animate-pulse rounded-xl bg-zinc-100" />
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <Progress
          value={progress}
          className={cn(
            "w-full gap-0 animate-pulse",
            "[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-white/10",
            "[&_[data-slot=progress-indicator]]:bg-gradient-to-r",
            "[&_[data-slot=progress-indicator]]:from-emerald-400",
            "[&_[data-slot=progress-indicator]]:to-cyan-400",
          )}
        />
        <p className="flex items-start justify-center gap-1.5 text-xs font-semibold leading-4 text-red-400">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Este código se actualiza automáticamente. No hagas capturas de
          pantalla.
        </p>
      </div>
    </div>
  )
}
