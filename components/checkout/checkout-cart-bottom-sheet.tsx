"use client"

import { ArrowRight, LoaderCircle, Map, X } from "lucide-react"
import { useEffect, useState } from "react"

import { CartSummary } from "@/components/public/cart-summary"
import {
  CartTotalAmount,
  CartTotalLabel,
} from "@/components/public/cart-total-transparency"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

const MOBILE_CART_SHEET_QUERY = "(max-width: 1023px)"

function useMobileCartSheet() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_CART_SHEET_QUERY)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isMobile
}

export function CheckoutCartBottomSheet({
  open,
  onOpenChange,
  totalAmount,
  onContinue,
  continueLabel,
  continuePending = false,
  continueDisabled = false,
  continuePendingLabel = "Procesando pago...",
  continueVariant = "default",
  showContinueArrow = false,
  formId,
  onEditMap,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalAmount: number
  onContinue?: () => void
  continueLabel?: string
  continuePending?: boolean
  continueDisabled?: boolean
  continuePendingLabel?: string
  continueVariant?: "default" | "outline"
  showContinueArrow?: boolean
  formId?: string
  onEditMap?: () => void
}) {
  const isMobile = useMobileCartSheet()
  const cartLines = useCheckoutStore((state) => state.lines)

  useEffect(() => {
    if (open && cartLines.length === 0) onOpenChange(false)
  }, [cartLines.length, onOpenChange, open])

  useEffect(() => {
    if (open && !isMobile) onOpenChange(false)
  }, [isMobile, onOpenChange, open])

  if (!isMobile) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="z-[100]"
        className="z-[100] flex max-h-[min(85dvh,100dvh)] w-full flex-col gap-0 overflow-hidden rounded-t-xl p-0"
      >
        <SheetHeader className="flex-none border-b border-border px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-bold text-foreground">
              Desglose de compra
            </SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <SheetDescription className="sr-only">
            Revisá o quitá las entradas seleccionadas.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <CartSummary
            items={cartLines}
            heading=""
            showClear={false}
            compact
            showGrandTotal={false}
          />
        </div>

        <div className="flex-none space-y-3 border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <CartTotalLabel className="text-sm font-medium text-muted-foreground" />
            <CartTotalAmount
              amount={totalAmount}
              className="text-xl font-black text-foreground"
            />
          </div>
          {onContinue || formId ? (
            <Button
              type={formId ? "submit" : "button"}
              form={formId}
              variant={continueVariant}
              disabled={continuePending || continueDisabled}
              aria-busy={continuePending}
              onClick={() => {
                if (formId) {
                  onOpenChange(false)
                  return
                }
                onContinue?.()
              }}
              className={cn(
                tapFeedbackClass,
                "h-12 w-full rounded-xl text-sm disabled:scale-100 disabled:opacity-70",
                continueVariant === "outline"
                  ? "border-white/20 text-foreground"
                  : "bg-emerald-500 font-extrabold text-black hover:bg-emerald-400",
              )}
            >
              {continuePending ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  {continuePendingLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {continueLabel ?? "Continuar"}
                  {showContinueArrow ? (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  ) : null}
                </span>
              )}
            </Button>
          ) : null}
          {onEditMap ? (
            <button
              type="button"
              onClick={onEditMap}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300"
            >
              <Map className="size-4" aria-hidden="true" />
              Ver en mapa
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
