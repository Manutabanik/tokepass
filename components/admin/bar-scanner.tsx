"use client"

import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner"
import {
  CameraOff,
  CheckCircle2,
  LoaderCircle,
  ScanLine,
  ShoppingBag,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"

import { redeemItemRPC, type RedeemItemResult } from "@/app/actions/addons"
import { configureZxingWasm } from "@/lib/scanner/configure-zxing"
import { cn } from "@/lib/utils"

type VisualState = "idle" | "success" | "error"

function playTone(kind: "success" | "error") {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.type = "sine"
    oscillator.frequency.value = kind === "success" ? 980 : 180
    gain.gain.value = 0.1
    oscillator.start()
    oscillator.stop(context.currentTime + (kind === "success" ? 0.16 : 0.4))
  } catch {
    // Audio opcional
  }
}

function vibrate(kind: "success" | "error") {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(kind === "success" ? [40, 30, 40] : [120, 60, 120])
    }
  } catch {
    // Vibration opcional
  }
}

function formatRedeemedTime(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return "—"
  }
}

export function StoreScanner() {
  configureZxingWasm()

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [visual, setVisual] = useState<VisualState>("idle")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const cooldownRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const returnToIdle = useCallback((delayMs: number) => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = window.setTimeout(() => {
      setVisual("idle")
      setTitle("")
      setSubtitle(null)
      setImageUrl(null)
      cooldownRef.current = false
    }, delayMs)
  }, [])

  const applyResult = useCallback(
    (result: RedeemItemResult) => {
      if (result.success) {
        playTone("success")
        vibrate("success")
        setVisual("success")
        setTitle(`Entregar: 1x ${result.itemName}`)
        setSubtitle(result.itemDescription)
        setImageUrl(result.itemImageUrl)
        returnToIdle(2200)
        return
      }

      playTone("error")
      vibrate("error")
      setVisual("error")
      setImageUrl(result.alreadyRedeemed ? result.itemImageUrl ?? null : null)

      if (result.alreadyRedeemed) {
        setTitle(`Alerta: ${result.itemName} ya fue entregado`)
        setSubtitle(
          `A las ${formatRedeemedTime(result.previousRedeemedAt)}`,
        )
        returnToIdle(2800)
        return
      }

      setTitle(result.message)
      setSubtitle(null)
      returnToIdle(2200)
    },
    [returnToIdle],
  )

  const onScan = useCallback(
    (detected: IDetectedBarcode[]) => {
      if (cooldownRef.current || isPending || visual !== "idle") return

      const raw = detected[0]?.rawValue?.trim()
      if (!raw) return

      cooldownRef.current = true
      startTransition(async () => {
        const result = await redeemItemRPC(raw)
        applyResult(result)
      })
    },
    [applyResult, isPending, visual],
  )

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
      {visual === "success" ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-500 px-6 text-center">
          <CheckCircle2 className="size-36 text-white sm:size-44" strokeWidth={2.5} aria-hidden="true" />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mt-6 size-28 rounded-2xl object-cover ring-2 ring-white/40"
            />
          ) : null}
          <p className="mt-6 text-5xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-3 max-w-md text-xl font-bold text-white/95">{subtitle}</p>
          ) : null}
        </div>
      ) : null}

      {visual === "error" ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-700 px-6 text-center">
          <XCircle className="size-36 text-white sm:size-44" strokeWidth={2.5} aria-hidden="true" />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="mt-6 size-24 rounded-2xl object-cover opacity-80"
            />
          ) : null}
          <p className="mt-6 text-5xl font-black leading-tight tracking-tight text-white sm:text-6xl">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-4 text-2xl font-bold tracking-wide text-white/95">
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400/90">
            <ShoppingBag className="size-3.5" aria-hidden="true" />
            Tienda
          </p>
          <h1 className="text-xl font-black tracking-tight">
            Escáner de Tienda / Canjes
          </h1>
        </div>
        {isPending ? (
          <LoaderCircle className="size-5 animate-spin text-violet-300" />
        ) : (
          <ScanLine className="size-5 text-zinc-500" aria-hidden="true" />
        )}
      </header>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-[1.75rem] bg-black ring-1 ring-zinc-800">
        {cameraError ? (
          <div className="grid h-full min-h-[55dvh] place-items-center px-6 text-center">
            <div>
              <CameraOff className="mx-auto size-10 text-zinc-500" />
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                {cameraError}
              </p>
            </div>
          </div>
        ) : (
          <Scanner
            onScan={onScan}
            onError={(error) => {
              setCameraError(
                error instanceof Error
                  ? error.message
                  : "No se pudo acceder a la cámara",
              )
            }}
            constraints={{ facingMode: "environment" }}
            formats={["qr_code"]}
            components={{ finder: false }}
            styles={{
              container: { width: "100%", height: "100%", minHeight: "55dvh" },
              video: { objectFit: "cover" },
            }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "size-56 rounded-3xl border-2 border-violet-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]",
              visual !== "idle" && "opacity-40",
            )}
          />
        </div>
      </div>

      <p className="px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center text-xs text-zinc-500">
        Apuntá al QR de canje del cliente. Validación atómica en menos de 2s.
      </p>
    </div>
  )
}

/** @deprecated Prefer StoreScanner */
export const BarScanner = StoreScanner
