"use client"

import { Check, Inbox, LoaderCircle, Ticket, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  claimIncomingTransferAction,
  rejectIncomingTransferAction,
  type IncomingPendingGift,
} from "@/app/actions/transfer"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export function IncomingPendingGifts({
  gifts,
}: {
  gifts: IncomingPendingGift[]
}) {
  if (gifts.length === 0) return null

  return (
    <section className="space-y-3" aria-label="Entradas pendientes de aceptar">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <Inbox className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-foreground">
            Pendientes de aceptar
          </h2>
          <p className="text-sm text-muted-foreground">
            Alguien te transfirió{" "}
            {gifts.length === 1 ? "una entrada" : `${gifts.length} entradas`}.
            Aceptala para sumarla a tu billetera.
          </p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {gifts.map((gift) => (
          <li key={gift.transferId}>
            <IncomingPendingGiftCard gift={gift} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function IncomingPendingGiftCard({ gift }: { gift: IncomingPendingGift }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejecting, startReject] = useTransition()
  const busy = isPending || rejecting

  function handleAccept() {
    if (busy) return
    startTransition(async () => {
      const result = await claimIncomingTransferAction(gift.transferId)
      if (!result.success) {
        if (result.loginUrl) {
          router.push(result.loginUrl)
          return
        }
        toast.error(result.error)
        return
      }
      toast.success("Entrada aceptada", {
        description: `${result.eventTitle} ya está en tu billetera.`,
      })
      router.refresh()
    })
  }

  function handleReject() {
    if (busy) return
    startReject(async () => {
      const result = await rejectIncomingTransferAction(gift.transferId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.message("Transferencia rechazada", {
        description: "La entrada volvió a quien te la envió.",
      })
      router.refresh()
    })
  }

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-3xl border border-amber-500/30 bg-card/90 p-4 shadow-lg shadow-black/10",
        "ring-1 ring-inset ring-amber-500/15",
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-amber-500/15 blur-2xl"
        aria-hidden="true"
      />
      <div className="flex gap-3">
        {gift.flyerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gift.flyerUrl}
            alt=""
            className="size-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Ticket className="size-6" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            Regalo pendiente
          </p>
          <h3 className="mt-0.5 truncate text-base font-bold text-foreground">
            {gift.eventTitle}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {gift.tierName}
            {gift.eventDate
              ? ` · ${formatEventDay(gift.eventDate)} ${formatEventTime(gift.eventDate)}`
              : null}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={handleAccept}
          className="h-11 rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Aceptar entrada
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={handleReject}
          className="h-11 rounded-full"
        >
          {rejecting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-4" aria-hidden="true" />
          )}
          Rechazar
        </Button>
      </div>
    </article>
  )
}
