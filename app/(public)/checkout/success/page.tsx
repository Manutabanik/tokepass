import type { Metadata } from "next"

import { getCheckoutOrderFulfillment } from "@/app/actions/checkout-fulfillment"
import { getEventItems, userHasEventTicket } from "@/app/actions/addons"
import { getPurchaseAnalyticsForOrder } from "@/app/actions/event-marketing"
import { CheckoutSuccessView } from "@/components/checkout/checkout-success-view"
import { EventStoreUpsell } from "@/components/public/event-store-upsell"
import { PurchaseAnalyticsTracker } from "@/components/public/purchase-analytics-tracker"
import { StoryFlyerSuccessCard } from "@/components/public/story-flyer-modal"
import { CheckoutWalletPrecache } from "@/components/pwa/checkout-wallet-precache"
import { hasActivePixels } from "@/lib/analytics/pixels"
import { getWalletUiFlags } from "@/lib/wallet-cache"

export const metadata: Metadata = {
  title: "Confirmando tu compra",
  description: "Estamos acreditando tu pago y preparando tus entradas.",
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string
    payment_id?: string
    status?: string
    free?: string
    sandbox?: string
  }>
}) {
  const { order_id, free, sandbox } = await searchParams
  const orderId = order_id?.trim() ?? ""
  const isFree = free === "1"
  const isSandbox = sandbox === "1"
  const skipPolling = isFree || isSandbox
  const walletFlags = getWalletUiFlags()

  const fulfillment = orderId
    ? await getCheckoutOrderFulfillment(orderId)
    : {
        orderId: "",
        status: "not_found" as const,
        tickets: [],
        userId: "",
        eventTitle: null,
        totalAmount: 0,
        holdExpiresAt: null,
      }

  const purchaseAnalytics = orderId
    ? await getPurchaseAnalyticsForOrder(orderId)
    : null

  const eventId = purchaseAnalytics?.eventId?.trim() || ""
  const [storeItems, canPurchase] = eventId
    ? await Promise.all([
        getEventItems(eventId).catch(() => []),
        userHasEventTicket(eventId).catch(() => false),
      ])
    : [[], false]

  return (
    <section className="relative isolate overflow-hidden">
      <CheckoutWalletPrecache />
      {purchaseAnalytics &&
      fulfillment.status === "paid" &&
      hasActivePixels(purchaseAnalytics.pixels) ? (
        <PurchaseAnalyticsTracker
          pixels={purchaseAnalytics.pixels}
          eventTitle={purchaseAnalytics.eventTitle}
          orderId={purchaseAnalytics.orderId}
          value={purchaseAnalytics.value}
          ticketIds={purchaseAnalytics.ticketIds}
        />
      ) : null}
      <div className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.1),transparent_40%)]" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center px-4 py-20 sm:px-6">
        <CheckoutSuccessView
          orderId={orderId}
          initial={fulfillment}
          skipPolling={skipPolling && fulfillment.status === "paid"}
          appleWalletEnabled={walletFlags.appleWalletEnabled}
          googleWalletEnabled={walletFlags.googleWalletEnabled}
        />

        {fulfillment.status === "paid" && purchaseAnalytics ? (
          <div className="mt-8 w-full">
            <StoryFlyerSuccessCard
              data={{
                eventTitle: purchaseAnalytics.eventTitle,
                eventDate:
                  purchaseAnalytics.eventDate || new Date().toISOString(),
                eventLocation:
                  purchaseAnalytics.eventLocation ||
                  "Ver ubicacion en Tokepass",
                imageUrl: purchaseAnalytics.eventImageUrl,
                customStoryUrl: purchaseAnalytics.socialShareImageUrl,
                mode: "buyer",
                eventId: purchaseAnalytics.eventId,
                organizerName: purchaseAnalytics.organizerName,
                organizerAvatarUrl: purchaseAnalytics.organizerAvatarUrl,
              }}
            />
          </div>
        ) : null}

        {fulfillment.status === "paid" && eventId && storeItems.length > 0 ? (
          <div className="mt-12 w-full text-left">
            <EventStoreUpsell
              eventId={eventId}
              eventTitle={purchaseAnalytics?.eventTitle ?? "tu evento"}
              items={storeItems}
              canPurchase={
                canPurchase || Boolean(purchaseAnalytics?.ticketIds.length)
              }
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
