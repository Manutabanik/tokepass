"use client"

import { Loader2, RefreshCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  cancelResaleListingAction,
  createResaleListingAction,
  getResaleListingPreview,
} from "@/app/actions/resale"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"

export function ResaleTicketDialog({
  ticketId,
  eventTitle,
  tierPrice,
  activeListingId,
  disabled = false,
  triggerLabel = "Vender mi entrada de forma segura",
  triggerClassName,
}: {
  ticketId: string
  eventTitle: string
  tierPrice: number
  activeListingId: string | null
  disabled?: boolean
  triggerLabel?: string
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{
    price: number
    sellerNet: number
    fee: number
  } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [isPending, startTransition] = useTransition()

  const listed = Boolean(activeListingId)

  async function openPublishModal() {
    setOpen(true)
    setLoadingPreview(true)
    try {
      const result = await getResaleListingPreview(ticketId)
      if (!result.success) {
        toast.error(result.error)
        setOpen(false)
        return
      }
      setPreview({
        price: result.data.price,
        sellerNet: result.data.sellerNet,
        fee: result.data.fee,
      })
    } finally {
      setLoadingPreview(false)
    }
  }

  function publish() {
    startTransition(async () => {
      const result = await createResaleListingAction(ticketId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Entrada publicada para reventa.")
      setOpen(false)
      router.refresh()
    })
  }

  function cancelListing() {
    if (!activeListingId) return
    startTransition(async () => {
      const result = await cancelResaleListingAction(activeListingId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Publicación retirada del marketplace.")
      router.refresh()
    })
  }

  if (tierPrice <= 0) return null

  if (listed) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-100">
          Publicada para reventa
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || isPending}
          onClick={cancelListing}
          className="h-11 w-full rounded-full"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCcw className="mr-2 size-4" aria-hidden />
          )}
          Retirar del marketplace
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => void openPublishModal()}
        className={triggerClassName ?? "h-11 w-full rounded-full"}
      >
        <RefreshCcw className="size-4" aria-hidden />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reventa oficial Tokepass
            </DialogTitle>
            <DialogDescription>
              Tu entrada de{" "}
              <span className="font-medium text-foreground">{eventTitle}</span> se
              publicará en el marketplace oficial al precio actual. Cuando se
              venda, el dinero se acreditará en tu cuenta.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview || !preview ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Calculando precio oficial…
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/40 px-4 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Precio de publicación</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(preview.price)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Fee Tokepass (10%)</span>
                <span className="text-foreground">
                  {formatCurrency(preview.fee)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="font-medium text-foreground">
                  Vas a recibir
                </span>
                <span className="font-bold text-emerald-400">
                  {formatCurrency(preview.sellerNet)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={publish}
              disabled={isPending || loadingPreview || !preview}
              className="rounded-full bg-violet-600 text-white hover:bg-violet-500"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Publicando…
                </>
              ) : (
                "Publicar en marketplace"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
