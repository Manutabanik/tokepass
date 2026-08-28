"use client"

import { ArrowRight, Loader2, ScanSearch } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { AdaptiveSeatingFlow } from "@/components/public/adaptive-seating-flow"
import { CartSummary } from "@/components/public/cart-summary"
import type { SeatSelectionContext } from "@/components/public/seat-selection-sheet"
import { CheckoutLegalClickwrap } from "@/components/checkout/checkout-legal-clickwrap"
import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import { Button } from "@/components/ui/button"
import { cartLineAmount, cartLineQuantity } from "@/lib/checkout/cart-lines"
import { formatCartTotal } from "@/lib/format"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import {
  storefrontSelectionCount,
  storefrontSelectionTotal,
  useStorefrontSeatStore,
} from "@/lib/stores/storefront-seat-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

export type CheckoutSidebarCta = {
  label: string
  pending?: boolean
  pendingLabel?: string
  disabled?: boolean
  locked?: boolean
  showArrow?: boolean
  pulse?: boolean // kept for callers; pulse no longer applied to the pay CTA
  formId?: string
  onClick: () => void
}

function SummaryVenueMap({
  seatSelection,
  readOnly = true,
  compact = true,
  toolbarTitle = null,
  onCloseMap,
  maxSelectable = null,
}: {
  seatSelection: SeatSelectionContext
  readOnly?: boolean
  compact?: boolean
  toolbarTitle?: string | null
  onCloseMap?: () => void
  maxSelectable?: number | null
}) {
  if (!seatSelection.map) return null
  return (
    <AdaptiveSeatingFlow
      immersive
      compact={compact}
      readOnly={readOnly}
      toolbarTitle={toolbarTitle}
      onCloseMap={onCloseMap}
      pending={false}
      maxSelectable={maxSelectable}
      eventId={seatSelection.eventId}
      eventTitle={seatSelection.eventTitle}
      venueMap={seatSelection.map}
      selectedZoneId={seatSelection.selectedZoneId}
      unavailableZoneIds={seatSelection.unavailableZoneIds}
      occupancyBySeatId={seatSelection.occupancyBySeatId}
      heldSeatIds={seatSelection.heldSeatIds}
      priceBySectorId={seatSelection.priceBySectorId}
      sectors={seatSelection.sectors}
      onSelectZone={readOnly ? undefined : seatSelection.onSelectZone}
      onContinue={readOnly ? undefined : seatSelection.onUniversalContinue}
    />
  )
}

export function CheckoutSelectionSidebar({
  seatSelection,
  className,
  cta,
  maxSelectable = null,
  legalConsent = null,
}: {
  seatSelection: SeatSelectionContext | null
  className?: string
  cta?: CheckoutSidebarCta | null
  legalConsent?: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
  } | null
  maxSelectable?: number | null
}) {
  const cartLines = useCheckoutStore((state) => state.lines)
  const selectedItems = useStorefrontSeatStore((state) => state.selectedItems)
  const placeCount = storefrontSelectionCount(selectedItems)
  const cartCount = cartLines.reduce(
    (sum, line) => sum + cartLineQuantity(line.quantity),
    0,
  )
  const placeTotal = storefrontSelectionTotal(selectedItems)
  const cartTotal = cartLines.reduce((sum, line) => sum + cartLineAmount(line), 0)
  const itemCount = cartLines.length > 0 ? cartCount : placeCount
  const total = cartLines.length > 0 ? cartTotal : placeTotal
  const [isMapZoomed, setIsMapZoomed] = useState(false)
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const hasMap = Boolean(seatSelection?.map)

  useEffect(() => {
    if (!isMapZoomed) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMapZoomed(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isMapZoomed])

  return (
    <aside
      className={cn(
        "flex flex-col rounded-3xl border border-border/60 bg-card/60 p-6 shadow-2xl backdrop-blur-xl",
        "lg:h-[calc(100vh-8rem)] lg:max-h-[calc(100vh-8rem)] lg:self-start",
        className,
      )}
    >
      <h3 className="shrink-0 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Resumen
      </h3>

      {hasMap && seatSelection?.map ? (
        <div className="group relative mt-4 shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-muted">
          <div className="pointer-events-none h-36">
            <SummaryVenueMap seatSelection={seatSelection} />
          </div>
          <button
            type="button"
            onClick={() => setIsMapZoomed(true)}
            aria-haspopup="dialog"
            aria-expanded={isMapZoomed}
            aria-label="Ampliar mapa"
            className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/45"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-bold text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <ScanSearch className="size-3.5" aria-hidden="true" />
              Ampliar mapa
            </span>
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
        {cartLines.length > 0 ? (
          <CartSummary
            className="min-h-0 flex-1"
            items={cartLines}
            heading="Desglose"
            showClear
            compact
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Elegí tus entradas o lugares para ver el desglose en vivo.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border bg-card/95 pt-4 backdrop-blur-md">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            {itemCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? "entrada" : "entradas"}
              </p>
            ) : null}
          </div>
          <p className="text-2xl font-black tabular-nums text-foreground">
            {formatCartTotal(total)}
          </p>
        </div>
        <TokepassGuaranteeBadge variant="full" className="mt-3" />

        {cta ? (
          <div className="mt-4 hidden lg:block">
            {legalConsent ? (
              <CheckoutLegalClickwrap
                checked={legalConsent.checked}
                onCheckedChange={legalConsent.onCheckedChange}
                disabled={legalConsent.disabled}
                className="mb-3"
              />
            ) : null}
            <Button
              type={cta.formId ? "submit" : "button"}
              form={cta.formId}
              size="storefront"
              disabled={
                Boolean(cta.pending) ||
                Boolean(cta.locked) ||
                Boolean(cta.disabled) ||
                (cartLines.length === 0 && placeCount === 0)
              }
              aria-busy={Boolean(cta.pending)}
              onClick={
                cta.formId
                  ? undefined
                  : () => {
                      if (
                        cta.pending ||
                        cta.locked ||
                        cta.disabled ||
                        (cartLines.length === 0 && placeCount === 0)
                      ) {
                        return
                      }
                      cta.onClick()
                    }
              }
              className={cn(
                tapFeedbackClass,
                "h-14 w-full rounded-xl bg-emerald-500 px-6 text-lg font-black text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-400 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-70",
                cta.disabled && "cursor-not-allowed opacity-70",
              )}
            >
              {cta.pending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  {cta.pendingLabel ?? "Procesando pago..."}
                </span>
              ) : (
                <>
                  <span className="min-w-0 truncate">{cta.label}</span>
                  {cta.showArrow ? (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  ) : null}
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {portalReady && isMapZoomed && seatSelection?.map
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col bg-muted"
              role="dialog"
              aria-modal="true"
              aria-label="Mapa del recinto"
            >
              <div className="min-h-0 flex-1">
                <SummaryVenueMap
                  seatSelection={seatSelection}
                  readOnly={false}
                  compact={false}
                  maxSelectable={maxSelectable}
                  toolbarTitle="Mapa del recinto"
                  onCloseMap={() => setIsMapZoomed(false)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </aside>
  )
}
