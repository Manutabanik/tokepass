import { ArrowRight, CheckCircle2, Ticket } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { CheckoutWalletPrecache } from "@/components/pwa/checkout-wallet-precache"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Pago iniciado",
  description: "Tu pago con Mercado Pago fue procesado.",
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string
    payment_id?: string
    status?: string
    free?: string
  }>
}) {
  const { order_id, free } = await searchParams
  const isFree = free === "1"

  return (
    <section className="relative isolate overflow-hidden">
      <CheckoutWalletPrecache />
      <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_40%)]" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full bg-emerald-400/20 blur-2xl" />
          <span className="relative grid size-24 place-items-center rounded-full bg-emerald-500 text-white shadow-2xl shadow-emerald-500/30">
            <CheckCircle2 className="size-14" strokeWidth={2.25} aria-hidden="true" />
          </span>
        </div>

        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">
          {isFree ? "Entrada gratuita" : "Mercado Pago"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-zinc-950 sm:text-4xl">
          {isFree ? "¡Entrada emitida!" : "¡Pago recibido!"}
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-600">
          {isFree
            ? "Tu entrada ya está disponible en tu billetera"
            : "Estamos confirmando la transacción con el webhook de Mercado Pago. En segundos tus entradas quedarán disponibles en tu billetera"}
          {order_id ? (
            <>
              {" "}
              (orden{" "}
              <code className="font-mono text-xs">{order_id.slice(0, 8)}</code>)
            </>
          ) : null}
          .
        </p>

        <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="h-12 rounded-full bg-violet-600 px-6 text-white hover:bg-violet-700"
            nativeButton={false}
            render={<Link href="/my-tickets" />}
          >
            <Ticket aria-hidden="true" />
            Ir a mis entradas
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-full px-6"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Seguir explorando
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  )
}
