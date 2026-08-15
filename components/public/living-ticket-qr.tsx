"use client"

import { ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { Progress } from "@/components/ui/progress"
import {
  generateLivingQrPayload,
  getTotpRemainingSeconds,
  getTotpWindow,
  getTotpWindowProgress,
} from "@/lib/totp-offline"
import { cn } from "@/lib/utils"

/**
 * QR dinámico offline: el payload no expone la semilla, aunque el dispositivo
 * autorizado debe conservarla localmente para poder firmar sin conexión.
 */
export function LivingTicketQR({
  ticketId,
  totpSecret,
  className,
  size = 208,
  variant = "card",
}: {
  ticketId: string
  totpSecret?: string
  className?: string
  size?: number
  variant?: "card" | "scan"
}) {
  const secret = totpSecret || ticketId
  const isScan = variant === "scan"
  const [token, setToken] = useState("")
  const [progress, setProgress] = useState(() => getTotpWindowProgress())
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getTotpRemainingSeconds(),
  )

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
      setRemainingSeconds(getTotpRemainingSeconds())

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
    <div
      className={cn(
        "text-center",
        isScan ? "w-full" : "mx-auto w-full max-w-[260px]",
        className,
      )}
    >
      <div
        className={cn(
          "relative mx-auto grid select-none place-items-center",
          isScan && "w-full",
        )}
        onContextMenu={(event) => event.preventDefault()}
      >
        {isScan ? null : (
          <div className="absolute inset-0 rounded-[1.75rem] bg-emerald-400/15 blur-2xl" />
        )}
        <div
          className={cn(
            isScan
              ? "relative aspect-square w-full bg-transparent p-0"
              : "pointer-events-none relative rounded-[1.35rem] bg-white p-3.5 shadow-[0_0_32px_rgba(255,255,255,0.08)]",
          )}
        >
          {token ? (
            <QRCodeSVG
              value={token}
              size={size}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#09090b"
              className={cn("mx-auto", isScan && "h-auto w-full")}
            />
          ) : (
            <div
              className={cn(
                "animate-pulse rounded-xl bg-zinc-100",
                isScan && "aspect-square w-full",
              )}
              style={isScan ? undefined : { width: size, height: size }}
            />
          )}
        </div>
      </div>

      <div className={cn("space-y-2.5", isScan ? "mt-5" : "mt-4")}>
        <Progress
          value={progress}
          className={cn(
            "w-full gap-0 animate-pulse",
            isScan
              ? "[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-zinc-200"
              : "[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-white/10",
            "[&_[data-slot=progress-indicator]]:bg-gradient-to-r",
            "[&_[data-slot=progress-indicator]]:from-emerald-400",
            "[&_[data-slot=progress-indicator]]:to-cyan-400",
          )}
        />
        {isScan ? (
          <p className="text-sm font-bold tabular-nums text-zinc-800">
            Se renueva en {remainingSeconds}s
          </p>
        ) : (
          <p className="flex items-start justify-center gap-1.5 text-xs font-semibold leading-4 text-red-400">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Este código se actualiza automáticamente. No hagas capturas de
            pantalla.
          </p>
        )}
      </div>
    </div>
  )
}
