import { ArrowRight, CalendarDays, MapPin, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.18),transparent_42%),radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_36%)]" />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Entradas digitales, rápidas y seguras
          </div>
          <h1 className="max-w-3xl text-5xl font-black tracking-[-0.045em] text-zinc-950 sm:text-6xl lg:text-7xl">
            Tu próxima historia empieza en un evento.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
            Descubre experiencias únicas, compra en segundos y lleva todas tus
            entradas contigo.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-12 rounded-full bg-violet-600 px-6 text-white shadow-xl shadow-violet-600/20 hover:bg-violet-700"
              nativeButton={false}
              render={<Link href="/events" />}
            >
              Explorar eventos
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 rounded-full px-6"
              nativeButton={false}
              render={<Link href="/admin" />}
            >
              Publicar un evento
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-violet-500/10 blur-3xl" />
          <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-950 p-3 shadow-2xl shadow-zinc-950/20">
            <div className="aspect-[4/3] rounded-[1.4rem] bg-[linear-gradient(145deg,#6d28d9,#18181b_60%)] p-7 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">
                Evento destacado
              </p>
              <div className="mt-28">
                <h2 className="text-3xl font-bold">Neon City Festival</h2>
                <div className="mt-5 flex flex-wrap gap-4 text-sm text-zinc-300">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4" /> 18 Oct, 2026
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4" /> Buenos Aires
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
