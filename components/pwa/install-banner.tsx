"use client"

import { Download, X } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { IosInstructionsModal } from "@/components/pwa/ios-instructions-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import { cn } from "@/lib/utils"

const SHOW_DELAY_MS = 1400

export function InstallBanner() {
  const {
    canShowBanner,
    isIos,
    dismiss,
    promptInstall,
  } = usePwaInstall()

  const [delayPassed, setDelayPassed] = useState(false)
  const [visible, setVisible] = useState(false)
  const [iosOpen, setIosOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const dismissTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!canShowBanner) {
      setVisible(false)
      setDelayPassed(false)
      return
    }

    const timer = window.setTimeout(() => {
      setDelayPassed(true)
      setVisible(true)
    }, SHOW_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [canShowBanner])

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current)
      }
    }
  }, [])

  function handleDismiss() {
    setVisible(false)
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current)
    }
    dismissTimerRef.current = window.setTimeout(() => dismiss(), 220)
  }

  async function handleInstall() {
    if (isIos) {
      setIosOpen(true)
      return
    }

    setInstalling(true)
    try {
      const outcome = await promptInstall()
      if (outcome === "ios") {
        setIosOpen(true)
        return
      }
      if (outcome === "accepted") {
        setVisible(false)
        dismiss()
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!canShowBanner && !iosOpen) {
    return null
  }

  return (
    <>
      {canShowBanner && delayPassed ? (
        <div
          role="dialog"
          aria-label="Instalar Tokepass"
          className={cn(
            "pointer-events-none fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg",
            "transition-all duration-300 ease-out",
            visible
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0",
          )}
        >
          <div
            className={cn(
              "pointer-events-auto relative overflow-hidden rounded-2xl border border-zinc-700/80",
              "bg-zinc-950/95 p-4 text-zinc-100 shadow-2xl shadow-black/50",
              "ring-1 ring-emerald-500/20 backdrop-blur-md",
              "supports-backdrop-filter:bg-zinc-950/85",
            )}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-emerald-500/15 blur-2xl"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={handleDismiss}
              className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              aria-label="Cerrar sugerencia de instalación"
            >
              <X className="size-4" />
            </button>

            <div className="flex gap-3 pr-8">
              <span className="relative mt-0.5 size-12 shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-700">
                <Image
                  src="/icons/icon-192.png"
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 object-cover"
                  priority={false}
                />
              </span>

              <div className="min-w-0 flex-1 space-y-1.5">
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-500/35 bg-emerald-500/10 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
                >
                  PWA Lite (Ocupa &lt; 3 MB)
                </Badge>
                <h2 className="text-base font-bold tracking-tight text-white">
                  Instala la App de Tokepass
                </h2>
                <p className="text-sm leading-5 text-zinc-400">
                  Abre tus entradas sin señal, escanea en puerta y gestiona tus
                  eventos rápidamente.
                </p>
              </div>
            </div>

            <Button
              type="button"
              disabled={installing}
              onClick={() => void handleInstall()}
              className="mt-4 h-11 w-full rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              <Download className="size-4" aria-hidden="true" />
              Instalar en 1 Click
            </Button>
          </div>
        </div>
      ) : null}

      <IosInstructionsModal open={iosOpen} onOpenChange={setIosOpen} />
    </>
  )
}
