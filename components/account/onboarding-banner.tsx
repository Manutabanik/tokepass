"use client"

import { IdCard, Smartphone, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

const PWA_BANNER_KEY = "tokepass_pwa_banner_dismissed_v1"

export function OnboardingBanner({ hasDni }: { hasDni: boolean }) {
  const [showPwa, setShowPwa] = useState(false)

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(PWA_BANNER_KEY)
      setShowPwa(dismissed !== "1")
    } catch {
      setShowPwa(true)
    }
  }, [])

  function dismissPwa() {
    try {
      window.localStorage.setItem(PWA_BANNER_KEY, "1")
    } catch {
      // ignore
    }
    setShowPwa(false)
  }

  if (hasDni && !showPwa) return null

  return (
    <div className="space-y-3">
      {!hasDni ? (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-200">
              <IdCard className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-50">
                Completá tu DNI
              </p>
              <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
                Completá tu DNI para que podamos identificarte en la puerta del
                evento si no tenés tu celular encima.
              </p>
              <Button
                className="mt-3 h-10 rounded-xl bg-amber-400 font-semibold text-zinc-950 hover:bg-amber-300"
                nativeButton={false}
                render={<Link href="/cuenta/perfil" />}
              >
                Ir a Mis Datos
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showPwa ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <button
            type="button"
            onClick={dismissPwa}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-emerald-200/80 transition hover:bg-emerald-500/20 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
          <div className="flex gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-200">
              <Smartphone className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-50">
                Entradas siempre a mano
              </p>
              <p className="mt-1 text-sm leading-relaxed text-emerald-100/80">
                Llevá tus entradas siempre con vos. Agregá Tokepass a tu
                pantalla de inicio para ver tus QRs sin conexión a internet.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
