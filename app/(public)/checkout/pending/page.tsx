import { Clock3 } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Pago en proceso",
}

export default async function CheckoutPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const { order_id } = await searchParams

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-20 place-items-center rounded-full bg-amber-500/15 text-amber-500">
        <Clock3 className="size-10" />
      </span>
      <h1 className="mt-8 text-3xl font-black tracking-tight text-zinc-950">
        Pago en revisión
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Mercado Pago todavía está procesando tu pago
        {order_id ? (
          <>
            {" "}
            (orden <code className="font-mono text-xs">{order_id.slice(0, 8)}</code>)
          </>
        ) : null}
        . Te avisaremos cuando se confirme. Mientras tanto podés revisar Mis
        entradas.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          className="h-12 rounded-full bg-violet-600 px-6 text-white hover:bg-violet-700"
          nativeButton={false}
          render={<Link href="/cuenta/entradas" />}
        >
          Ir a mis entradas
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-full px-6"
          nativeButton={false}
          render={<Link href="/events" />}
        >
          Seguir explorando
        </Button>
      </div>
    </section>
  )
}
