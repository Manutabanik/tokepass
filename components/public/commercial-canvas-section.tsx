"use client"

import { GitCompare } from "lucide-react"
import { useEffect, useState } from "react"

import { CommercialCanvasModal } from "@/components/public/commercial-canvas-modal"
import { LandingReveal } from "@/components/public/landing-reveal"

export function CommercialCanvasSection() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function syncHash() {
      if (window.location.hash === "#comparativa") setOpen(true)
    }
    syncHash()
    window.addEventListener("hashchange", syncHash)
    return () => window.removeEventListener("hashchange", syncHash)
  }, [])

  return (
    <section
      id="comparativa"
      className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pb-24 sm:px-6 lg:px-8"
    >
      <LandingReveal>
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 px-6 py-10 sm:px-10 sm:py-12">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
            {"Tecnolog\u00eda de productor"}
          </p>
          <h2 className="mt-4 max-w-3xl text-balance text-3xl font-black tracking-tight text-white sm:text-5xl">
            {"\u00bfPor qu\u00e9 los mejores productores eligen TokePass?"}
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
            {"Descubr\u00ed la tecnolog\u00eda que protege tu recaudaci\u00f3n, acelera la puerta y garantiza el consumo en barra."}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-sm font-semibold text-white shadow-[0_12px_40px_-12px_rgba(139,92,246,0.9)] transition hover:from-violet-500 hover:to-fuchsia-500 sm:w-auto"
          >
            <GitCompare className="size-4 shrink-0" aria-hidden="true" />
            Ver comparativa completa vs Tiqueteras Tradicionales
          </button>
        </div>
      </LandingReveal>
      <CommercialCanvasModal open={open} onOpenChange={setOpen} />
    </section>
  )
}
