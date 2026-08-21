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
  compact = false,
}: {
  ticketId: string
  totpSecret?: string
  className?: string
  size?: number
  variant?: "card" | "scan"
  compact?: boolean
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
        compact ? "mx-auto w-full" : "mx-auto w-full max-w-sm",
        className,
      )}
    >
      <div
        className={cn(
          "relative mx-auto grid select-none place-items-center",
          compact ? "size-40" : "w-full",
        )}
        onContextMenu={(event) => event.preventDefault()}
      >
        {isScan ? null : (
          <div className="absolute inset-0 rounded-[1.75rem] bg-emerald-400/15 blur-2xl" />
        )}
        <div
          className={cn(
            "relative aspect-square w-full bg-white p-4",
            compact && "rounded-xl p-2 shadow-inner",
            isScan
              ? "p-0"
              : "pointer-events-none rounded-[1.35rem] shadow-[0_0_32px_rgba(255,255,255,0.08)]",
            compact && isScan && "p-2",
          )}
          style={isScan ? { colorScheme: "light" } : undefined}
        >
          {token ? (
            <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-white">
              <QRCodeSVG
                value={token}
                size={size}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#000000"
                className="mx-auto h-full w-full bg-white"
                style={{ width: "100%", height: "100%" }}
              />
              {isScan ? null : (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  >
                    <span className="living-qr-scan-beam absolute inset-x-0 top-0 h-[28%] bg-gradient-to-b from-transparent via-emerald-400/80 to-transparent" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="living-qr-live-ring pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-emerald-400/50"
                  />
                </>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "animate-pulse rounded-xl bg-zinc-100",
                "aspect-square w-full",
              )}
            />
          )}
        </div>
      </div>

      {compact && isScan ? (
        <p className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
          Se renueva en {remainingSeconds}s
        </p>
      ) : (
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
      )}
    </div>
  )
}
