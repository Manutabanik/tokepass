"use client"

import { Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CART_HOLD_EXPIRED_MODAL_MESSAGE,
  CART_HOLD_EXPIRED_MODAL_TITLE,
} from "@/lib/checkout-hold"

export function CheckoutHoldExpiredModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Clock className="size-5 text-primary" aria-hidden="true" />
            {CART_HOLD_EXPIRED_MODAL_TITLE}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {CART_HOLD_EXPIRED_MODAL_MESSAGE}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            className="h-11 w-full rounded-xl font-bold"
            onClick={onClose}
          >
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
