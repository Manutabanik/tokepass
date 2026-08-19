import type { Metadata } from "next"
import Link from "next/link"

import { WithdrawalForm } from "@/components/legal/withdrawal-form"

export const metadata: Metadata = {
  title: "Arrepentimiento de compra",
  description:
    "Solicitá la cancelación de tu compra en TokePass dentro de los 10 días, si el evento no se realizó.",
}

export default function ArrepentimientoPage() {
  return (
    <section className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300/90">
        Defensa del consumidor
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        Arrepentimiento de Compra
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Tenés 10 días desde tu compra para solicitar la cancelación, siempre
        que el evento no se haya realizado. El derecho se ejerce conforme a la
        normativa argentina de contratos celebrados a distancia.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Completá el formulario con el mismo correo de la orden. El número de
        orden está en{" "}
        <Link
          href="/cuenta/compras"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Mis compras
        </Link>
        . Si la solicitud cumple el plazo legal, anulamos los códigos QR de
        inmediato y procesamos la devolución con la pasarela de pago.
      </p>

      <div className="mt-10 rounded-3xl border border-border bg-card p-5 sm:p-6">
        <WithdrawalForm />
      </div>
    </section>
  )
}
