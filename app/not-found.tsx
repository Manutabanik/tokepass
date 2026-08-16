import type { Metadata } from "next"
import Link from "next/link"

import { BrandLogo } from "@/components/shared/brand-logo"

export const metadata: Metadata = {
  title: "Página no encontrada",
}

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.16),transparent_50%)]" />
      <BrandLogo href="/" size="lg" />
      <h1 className="mt-8 text-7xl font-black tracking-tight text-foreground">
        404
      </h1>
      <h2 className="mb-4 mt-2 text-2xl font-bold text-foreground">
        Parece que te perdiste en el recinto
      </h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        La página que estás buscando no existe, fue movida o el evento ya
        finalizó.
      </p>
      <Link
        href="/"
        className="rounded-full bg-primary px-8 py-3 font-bold text-primary-foreground transition-all hover:bg-primary/90"
      >
        Volver al Inicio
      </Link>
    </main>
  )
}
