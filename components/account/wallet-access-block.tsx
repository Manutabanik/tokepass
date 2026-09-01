"use client"

import { LoaderCircle, Tag, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createResaleListingAction } from "@/app/actions/resale"
import type { MyTicket } from "@/app/actions/tickets"
import { WalletPassCard } from "@/components/account/wallet-pass-card"
import { ResaleConfirmDialog } from "@/components/public/resale-confirm-dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import type { WalletAccessBlock } from "@/lib/ticket-wallet"
import { walletChildPlaceLabel } from "@/lib/ticket-wallet"
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
  const [resaleOpen, setResaleOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const eligible = sellableTickets(block.tickets, offline)
  const canSellBlock = eligible.length > 0
  const sellLabel =
    block.tickets[0]?.seatingLayoutType === "table_combo"
      ? "Vender Mesa Completa"
      : "Vender combo"
  const totalValue = eligible.reduce((sum, ticket) => sum + ticket.tierPrice, 0)

  if (block.kind === "single") {
    const ticket = block.tickets[0]
    if (!ticket) return null
    return (
      <WalletPassCard
        ticket={ticket}
        placeLabel={walletChildPlaceLabel(ticket, 0, 1)}
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
    <Accordion className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <AccordionItem value={block.id} className="border-0">
        <div className="flex items-stretch gap-1">
          <AccordionTrigger className="min-w-0 flex-1 items-center px-4 py-3 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Users className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-bold text-foreground">
                  {block.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {block.accessCount}{" "}
                  {block.accessCount === 1 ? "acceso" : "accesos"} · Tocá para
                  ver cada lugar
                </span>
              </span>
            </span>
          </AccordionTrigger>
        </div>
        {canSellBlock ? (
          <div className="px-4 pb-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setResaleOpen(true)}
              className="h-11 w-full rounded-xl"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Tag className="size-4" aria-hidden="true" />
              )}
              {sellLabel}
            </Button>
          </div>
        ) : null}
        <AccordionContent className={cn("px-3 pb-3", "[&_p:not(:last-child)]:mb-0")}>
          <ul className="space-y-2">
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
        </AccordionContent>
      </AccordionItem>
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
    </Accordion>
  )
}
