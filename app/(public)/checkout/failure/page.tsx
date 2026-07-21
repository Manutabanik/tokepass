import { AlertTriangle, ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Pago no completado",
}

export default async function CheckoutFailurePage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id } = await searchParams

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-red-500/15 text-red-500">
        <AlertTriangle className="size-10" />
      </span>
      <h1 className="mt-8 text-3xl font-black tracking-tight text-zinc-950">
        El pago no se completó
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Mercado Pago rechazó o canceló la operación.
        {order_id ? (
          <>
            {" "}
            Orden <code className="font-mono text-xs">{order_id.slice(0, 8)}</code>.
          </>
        ) : null}{" "}
        Si se te descontó el stock por error, contactanos; las reservas fallidas
        se liberan automáticamente cuando el checkout no inicia.
      </p>
      <Button
        className="mt-8 h-12 rounded-full bg-violet-600 px-6 text-white hover:bg-violet-700"
        nativeButton={false}
        render={<Link href="/events" />}
      >
        Volver a eventos
        <ArrowRight />
      </Button>
    </section>
  )
}
