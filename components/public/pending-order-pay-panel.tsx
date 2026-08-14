"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { createPaymentPreference } from "@/app/actions/payments"
import { CheckoutCountdown } from "@/components/public/checkout-countdown"
import { Button } from "@/components/ui/button"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"

export function PendingOrderPayPanel({
  orderId,
  expiresAt,
  eventId,
}: {
  orderId: string
  expiresAt: string
  eventId: string | null
}) {
  const [pending, startTransition] = useTransition()

  function continuePayment() {
    startTransition(async () => {
      const result = await createPaymentPreference(orderId)
      if (!result.success) {
        toast.error("No se pudo reabrir Mercado Pago", {
          description: result.error,
        })
        return
      }
      redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
    })
  }

  return (
    <div className="space-y-4">
      <CheckoutCountdown
        expiresAt={expiresAt}
        redirectTo={eventId ? `/events/${eventId}` : "/events"}
        className="border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100"
      />
      <p className="text-sm text-muted-foreground">
        Si saliste de Mercado Pago, podés retomar el pago mientras la reserva
        siga vigente.
      </p>
      <Button
        type="button"
        className="min-h-12 w-full rounded-xl bg-[#009EE3] font-black text-white hover:bg-[#08A8EE]"
        disabled={pending}
        onClick={continuePayment}
      >
        {pending ? "Abriendo Mercado Pago…" : "Continuar pago con Mercado Pago"}
      </Button>
    </div>
  )
}
