"use client"

import { ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

import { Progress } from "@/components/ui/progress"
import {
  STORE_QR_ROTATION_MS,
  encodeLivingStorePayload,
  storeQrRemainingMs,
  storeTimestampBlock,
} from "@/lib/store/living-store-payload"
import { cn } from "@/lib/utils"

export function LivingStoreQR({
  token,
  className,
  size = 208,
  variant = "card",
}: {
  token: string
  className?: string
  size?: number
  variant?: "card" | "scan"
}) {
  const secret = token.trim()
  const isScan = variant === "scan"
  const [payload, setPayload] = useState(() =>
    secret ? encodeLivingStorePayload(secret) : "",
  )
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.ceil(storeQrRemainingMs() / 1000),
  )
  const [progress, setProgress] = useState(() => {
    const remaining = storeQrRemainingMs()
    return ((STORE_QR_ROTATION_MS - remaining) / STORE_QR_ROTATION_MS) * 100
  })

  useEffect(() => {
    if (!secret) {
      setPayload("")
      return
    }

    let lastBlock = storeTimestampBlock()
    setPayload(encodeLivingStorePayload(secret))

    const intervalId = window.setInterval(() => {
      const remaining = storeQrRemainingMs()
      setRemainingSeconds(Math.ceil(remaining / 1000))
      setProgress(((STORE_QR_ROTATION_MS - remaining) / STORE_QR_ROTATION_MS) * 100)
      const current = storeTimestampBlock()
      if (current !== lastBlock) {
        lastBlock = current
        setPayload(encodeLivingStorePayload(secret))
      }
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [secret])

  return (
    <div className={cn("mx-auto w-full text-center", className)}>
      <div
        className="relative mx-auto grid select-none place-items-center w-full"
        onContextMenu={(event) => event.preventDefault()}
      >
        {isScan ? null : (
          <div className="absolute inset-0 rounded-[1.75rem] bg-violet-400/15 blur-2xl" />
        )}
        <div
          className={cn(
            "relative aspect-square w-full bg-white p-4",
            isScan
              ? "p-0"
              : "pointer-events-none rounded-[1.35rem] shadow-[0_0_32px_rgba(255,255,255,0.08)]",
          )}
          style={isScan ? { colorScheme: "light" } : undefined}
        >
          {!secret ? (
            <div
              role="alert"
              className="grid h-full w-full place-items-center rounded-[inherit] bg-zinc-100 px-4 text-center text-sm font-semibold text-red-600"
            >
              Token de canje no disponible
            </div>
          ) : payload ? (
            <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-white">
              <QRCodeSVG
                value={payload}
                size={size}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#000000"
                className="mx-auto h-full w-full bg-white"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-100" />
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
            "[&_[data-slot=progress-indicator]]:from-violet-400",
            "[&_[data-slot=progress-indicator]]:to-fuchsia-400",
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
