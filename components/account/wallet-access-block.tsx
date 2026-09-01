"use client"

import { ChevronDown, LoaderCircle, Tag, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { createResaleListingAction } from "@/app/actions/resale"
import type { MyTicket } from "@/app/actions/tickets"
import { WalletPassCard } from "@/components/account/wallet-pass-card"
import { ResaleConfirmDialog } from "@/components/public/resale-confirm-dialog"
import { Button } from "@/components/ui/button"
import { formatEventDay } from "@/lib/format"
import type { WalletAccessBlock } from "@/lib/ticket-wallet"
import {
  ticketAdmissionTitle,
  walletAccessBlockExpandLabel,
  walletChildPlaceLabel,
} from "@/lib/ticket-wallet"
import { cn } from "@/lib/utils"

function sellableTickets(tickets: MyTicket[], offline: boolean): MyTicket[] {
  return tickets.filter(
    (ticket) =>
      ticket.status === "valid" &&
      ticket.tierPrice > 0 &&
      !ticket.isTest &&
      ticket.admissionsUsed === 0 &&
      ticket.transferCount < ticket.maxTransfersAllowed &&
      !ticket.pendingTransfer &&
      ticket.visualStatus === "active" &&
      !offline,
  )
}

export function WalletAccessBlockCard({
  block,
  offline = false,
}: {
  block: WalletAccessBlock<MyTicket>
  offline?: boolean
}) {
  const router = useRouter()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [resaleOpen, setResaleOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const eligible = sellableTickets(block.tickets, offline)
  const canSellBlock = eligible.length > 0
  const sellLabel =
    block.tickets[0]?.seatingLayoutType === "table_combo"
      ? "Vender Mesa Completa"
      : "Vender combo"
  const totalValue = eligible.reduce((sum, ticket) => sum + ticket.tierPrice, 0)
  const first = block.tickets[0]

  if (block.kind === "single") {
    const ticket = first
    if (!ticket) return null
    return (
      <WalletPassCard
        ticket={ticket}
        placeLabel={ticketAdmissionTitle(ticket, 0, 1)}
        offline={offline}
        canSell={canSellBlock}
        showQrInitially={false}
      />
    )
  }

  function sellBlock() {
    startTransition(async () => {
      for (const ticket of eligible) {
        const result = await createResaleListingAction(ticket.id, {
          termsAccepted: true,
        })
        if (!result.success) {
          toast.error(result.error)
          return
        }
      }
      toast.success("Publicamos el bloque en reventa.")
      router.refresh()
    })
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-card-foreground shadow-sm">
      <div className="space-y-3 px-4 pt-4 pb-3 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              {block.title}
            </h3>
            {first ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {first.eventTitle}
                {first.dayValidityLabel ? ` · ${first.dayValidityLabel}` : null}
                {` · ${formatEventDay(first.eventDate)}`}
              </p>
            ) : null}
          </div>
        </div>

        {canSellBlock ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setResaleOpen(true)}
            className="h-11 w-full justify-center rounded-xl"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Tag className="size-4" aria-hidden="true" />
            )}
            {sellLabel}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="h-12 w-full justify-center rounded-xl border-emerald-500/30 bg-background/80 text-sm font-semibold"
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-300",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
          {walletAccessBlockExpandLabel(block.accessCount, open)}
        </Button>
      </div>

      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="space-y-3 border-t border-emerald-500/15 px-3 pb-3 pt-3 sm:px-4">
            {block.tickets.map((ticket, index) => (
              <li key={ticket.id}>
                <WalletPassCard
                  ticket={ticket}
                  placeLabel={walletChildPlaceLabel(
                    ticket,
                    index,
                    block.tickets.length,
                  )}
                  offline={offline}
                  canSell={false}
                  showQrInitially={false}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ResaleConfirmDialog
        open={resaleOpen}
        onOpenChange={setResaleOpen}
        eventTitle={block.title}
        nominalValue={totalValue}
        pending={pending}
        onConfirm={() => {
          setResaleOpen(false)
          sellBlock()
        }}
      />
    </article>
  )
}
