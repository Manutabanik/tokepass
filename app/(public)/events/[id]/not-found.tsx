import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function EventNotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm font-semibold text-violet-600">404</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 dark:text-white">
        Evento no encontrado
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-500">
        Puede que el evento no exista, esté en borrador o haya sido cancelado.
      </p>
      <Button
        className="mt-8 rounded-full bg-violet-600 text-white hover:bg-violet-700"
        nativeButton={false}
        render={<Link href="/events" />}
      >
        Volver al catálogo
      </Button>
    </section>
  )
}
