"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Download, LoaderCircle, Ticket } from "lucide-react"
import useEmblaCarousel from "embla-carousel-react"

import type { PurchaseAnalyticsPayload } from "@/app/actions/event-marketing"
import { getCheckoutOrderFulfillment } from "@/app/actions/checkout-fulfillment"
import type { CheckoutOrderFulfillment } from "@/app/actions/checkout-fulfillment"
import { PurchaseAnalyticsTracker } from "@/components/public/purchase-analytics-tracker"
import { hasActivePixels } from "@/lib/analytics/pixels"
import { WalletPassButtons } from "@/components/account/wallet-pass-buttons"
import { LivingTicketCard } from "@/components/public/living-ticket-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { nextFulfillmentPollDelay } from "@/lib/checkout/fulfillment"
import { ticketPdfPath } from "@/lib/pdf/ticket-pdf-model"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn } from "@/lib/utils"

function PendingSkeleton() {
  return (
    <div className="w-full space-y-4" aria-hidden="true">
      <Skeleton className="mx-auto size-24 rounded-full" />
      <Skeleton className="mx-auto h-8 w-56" />
      <Skeleton className="mx-auto h-4 w-72" />
      <Skeleton className="mt-6 h-80 w-full rounded-3xl" />
    </div>
  )
}

function SuccessBurst() {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => (
        <motion.span
          key={index}
          className="absolute top-1/4 left-1/2 size-2 rounded-full bg-emerald-400/80"
          initial={{ opacity: 0.9, x: 0, y: 0, scale: 1 }}
          animate={{
            opacity: 0,
            x: (index % 2 === 0 ? 1 : -1) * (28 + index * 12),
            y: 40 + index * 18,
            scale: 0.4,
          }}
          transition={{ duration: 0.9, ease: "easeOut", delay: index * 0.04 }}
        />
      ))}
    </div>
  )
}

export function CheckoutSuccessView({
  orderId,
  initial,
  appleWalletEnabled,
  googleWalletEnabled,
  skipPolling = false,
  purchaseAnalytics = null,
}: {
  orderId: string
  initial: CheckoutOrderFulfillment
  appleWalletEnabled: boolean
  googleWalletEnabled: boolean
  skipPolling?: boolean
  purchaseAnalytics?: PurchaseAnalyticsPayload | null
}) {
  const [fulfillment, setFulfillment] = useState(initial)
  const [timedOut, setTimedOut] = useState(false)
  const holdExpiresAt = initial.holdExpiresAt
  const startedAt = useRef(0)
  const status = fulfillment.status
  const polling =
    !skipPolling && status === "pending" && !timedOut

  useEffect(() => {
    if (status !== "paid") return
    useCheckoutStore.getState().clearCart()
  }, [status])

  useEffect(() => {
    if (status !== "pending") return
    window.history.pushState({ tokepassFulfillment: true }, "", window.location.href)
    function onPopState() {
      window.history.pushState(
        { tokepassFulfillment: true },
        "",
        window.location.href,
      )
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [status])

  useEffect(() => {
    if (!polling) return
    let cancelled = false
    let timer = 0
    startedAt.current = Date.now()

    async function tick() {
      const next = await getCheckoutOrderFulfillment(orderId)
      if (cancelled) return
      setFulfillment(next)
      if (next.status !== "pending") return
      const wait = nextFulfillmentPollDelay(Date.now() - startedAt.current, {
        holdExpiresAt,
      })
      if (wait == null) {
        setTimedOut(true)
        return
      }
      timer = window.setTimeout(() => {
        void tick()
      }, wait)
    }

    timer = window.setTimeout(() => {
      void tick()
    }, nextFulfillmentPollDelay(0, { holdExpiresAt }) ?? 2000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [holdExpiresAt, orderId, polling])

  const tickets = fulfillment.tickets
  const firstTicket = tickets[0]
  const pdfHref = firstTicket
    ? ticketPdfPath(firstTicket.id, {
        size: "a4",
        download: true,
        ids: tickets.map((ticket) => ticket.id),
      })
    : null
  const [emblaRef] = useEmblaCarousel({
    align: "center",
    loop: tickets.length > 1,
    skipSnaps: false,
  })

  return (
    <div className="flex w-full flex-col items-center text-center">
      {purchaseAnalytics && hasActivePixels(purchaseAnalytics.pixels) ? (
        <PurchaseAnalyticsTracker
          enabled={status === "paid"}
          pixels={purchaseAnalytics.pixels}
          eventTitle={
            purchaseAnalytics.eventTitle || fulfillment.eventTitle || "Evento"
          }
          orderId={purchaseAnalytics.orderId || orderId}
          value={
            status === "paid" && fulfillment.totalAmount > 0
              ? fulfillment.totalAmount
              : purchaseAnalytics.value
          }
          ticketIds={
            fulfillment.tickets.length > 0
              ? fulfillment.tickets.map((ticket) => ticket.id)
              : purchaseAnalytics.ticketIds
          }
        />
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        {status === "pending" ? (
          <motion.div
            key="pending"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full"
          >
            <span className="relative mx-auto grid size-24 place-items-center rounded-full bg-card text-card-foreground shadow-lg ring-1 ring-border">
              <LoaderCircle
                className="size-10 animate-spin text-primary"
                aria-hidden="true"
              />
            </span>
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Confirmando pago
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
              Procesando tu pago
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Procesando tu pago de forma segura. Esto puede tomar unos
              segundos...
            </p>
            <div className="mt-8">
              <PendingSkeleton />
            </div>
            {timedOut ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Esto esta tardando un poco mas de lo habitual. Si ya pagaste,
                  tus entradas van a aparecer aca o en tu billetera.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    startedAt.current = Date.now()
                    setTimedOut(false)
                  }}
                >
                  Seguir esperando
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : status === "paid" ? (
          <motion.div
            key="paid"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full"
          >
            <SuccessBurst />
            <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-6 px-4 text-center">
              <div className="mb-2 flex size-20 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle2
                  className="size-12 text-emerald-500"
                  strokeWidth={3}
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  Pago confirmado
                </p>
                <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">
                  Ya estas adentro
                </h1>
                <p className="mx-auto max-w-md text-lg font-medium text-muted-foreground md:text-xl">
                  Te enviamos las entradas a tu{" "}
                  <span className="font-bold text-foreground">WhatsApp</span> y
                  a tu correo electronico.
                </p>
                <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                  {fulfillment.eventTitle
                    ? `Tambien podes presentar el Living QR en ${fulfillment.eventTitle}.`
                    : "Tambien podes presentar el Living QR en puerta."}{" "}
                  El codigo se renueva solo para evitar capturas de pantalla.
                </p>
              </div>
            </div>

            {tickets.length > 0 ? (
              <div className="mt-8 w-full">
                <div ref={emblaRef} className="overflow-hidden">
                  <div className="flex">
                    {tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        className={cn(
                          "min-w-0 shrink-0 grow-0 basis-full px-1",
                          tickets.length > 1 && "basis-[88%] sm:basis-[70%]",
                        )}
                      >
                        <LivingTicketCard
                          ticket={ticket}
                          userId={fulfillment.userId}
                          showQr
                          appleWalletEnabled={appleWalletEnabled}
                          googleWalletEnabled={googleWalletEnabled}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">
                El pago esta acreditado. Abrí tu billetera para ver el QR.
              </p>
            )}

            <div className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3 pt-2">
              {pdfHref ? (
                <a
                  href={pdfHref}
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-lg font-black text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-colors hover:bg-emerald-400"
                >
                  <Download className="size-5" aria-hidden="true" />
                  Descargar entradas ahora
                </a>
              ) : null}
              {firstTicket ? (
                <WalletPassButtons
                  ticketId={firstTicket.id}
                  flyerUrl={firstTicket.flyerUrl}
                  appleWalletEnabled={appleWalletEnabled}
                  googleWalletEnabled={googleWalletEnabled}
                  hidePdf
                />
              ) : null}
              <Link
                href="/cuenta/entradas"
                className="inline-flex h-12 items-center justify-center gap-2 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <Ticket className="size-4" aria-hidden="true" />
                Ir a mis entradas
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <h1 className="text-3xl font-black tracking-[-0.04em] text-foreground">
              {status === "expired"
                ? "La reserva expiro"
                : status === "failed"
                  ? "No pudimos confirmar el pago"
                  : "No encontramos esta orden"}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Si el cobro se hizo, escribinos con el numero de orden. Si no,
              podes volver a intentar la compra.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="h-12 rounded-full px-6"
                nativeButton={false}
                render={<Link href="/cuenta/entradas" />}
              >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

