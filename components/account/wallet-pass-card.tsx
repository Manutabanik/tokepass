"use client"

import { LoaderCircle, QrCode, Send, Tag, Undo2 } from "lucide-react"
import { useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { QrScanLightbox } from "@/components/public/qr-scan-lightbox"
import { ResaleConfirmDialog } from "@/components/public/resale-confirm-dialog"
import { TransferShareConfirmDialog } from "@/components/public/transfer-share-confirm-dialog"
import { useTicketResaleVisual } from "@/components/public/use-ticket-resale-visual"
import { useTicketTransferVisual } from "@/components/public/use-ticket-transfer-visual"
import { Button } from "@/components/ui/button"
import { isOnlineDelivery } from "@/lib/events/delivery-mode"
import { formatEventDay } from "@/lib/format"
import { walletQrModalTitle } from "@/lib/ticket-wallet"
import { cn } from "@/lib/utils"

function canShowTicketQr(ticket: MyTicket, visualStatus: string): boolean {
  return (
    !isOnlineDelivery(ticket.deliveryMode) &&
    ticket.status === "valid" &&
    visualStatus === "active" &&
    Boolean(ticket.totpSecret)
  )
}

export function WalletPassCard({
  ticket,
  placeLabel,
  offline = false,
  canSell = false,
  showQrInitially = false,
}: {
  ticket: MyTicket
  placeLabel: string
  offline?: boolean
  canSell?: boolean
  showQrInitially?: boolean
}) {
  const [qrOpen, setQrOpen] = useState(showQrInitially)
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false)
  const [resaleConfirmOpen, setResaleConfirmOpen] = useState(false)
  const transfer = useTicketTransferVisual(ticket)
  const resale = useTicketResaleVisual(ticket)
  const visualStatus =
    transfer.optimisticVisual ?? resale.optimisticVisual ?? ticket.visualStatus
  const transferPending = visualStatus === "transfer_pending"
  const resalePending = visualStatus === "resale_pending"
  const alreadySent = ticket.status === "transferred" || transferPending
  const canShowQr = canShowTicketQr(ticket, visualStatus)
  const isStatic = ticket.qrType === "static"
  const totpSecret = ticket.totpSecret ?? ""

  const canTransfer =
    ticket.status === "valid" &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    visualStatus === "active"

  const canResale =
    canSell &&
    ticket.status === "valid" &&
    ticket.tierPrice > 0 &&
    !ticket.isTest &&
    ticket.admissionsUsed === 0 &&
    ticket.transferCount < ticket.maxTransfersAllowed &&
    !offline &&
    visualStatus === "active"

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground",
        alreadySent && "opacity-60",
        ticket.isTest && "border-red-500/40",
      )}
    >
      <div className="space-y-1 px-4 py-3">
        <p className="text-lg font-bold tracking-tight text-foreground">
          {placeLabel}
        </p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {ticket.eventTitle}
          {ticket.dayValidityLabel ? ` · ${ticket.dayValidityLabel}` : null}
          {` · ${formatEventDay(ticket.eventDate)}`}
        </p>
      </div>

      <div className="flex w-full flex-col items-stretch gap-2 p-4 pt-0">
        {alreadySent ? (
          <Button
            type="button"
            variant="outline"
            disabled={
              transfer.pending ||
              !transfer.transferId ||
              ticket.status === "transferred"
            }
            onClick={transfer.cancelSend}
            className="h-12 w-full justify-center rounded-xl"
          >
            {transfer.pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 className="size-4" aria-hidden="true" />
            )}
            Recuperar entrada
          </Button>
        ) : (
          <>
            <Button
              type="button"
              disabled={!canShowQr}
              onClick={() => setQrOpen(true)}
              className="h-12 w-full justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <QrCode className="size-4" aria-hidden="true" />
              Mostrar QR
            </Button>
            <Button
              type="button"
              disabled={!canTransfer}
              onClick={() => setTransferConfirmOpen(true)}
              className="h-12 w-full justify-center rounded-xl border border-white/10 bg-zinc-900 text-white hover:bg-zinc-800"
            >
              {transfer.pending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              Enviar a un amigo
            </Button>
            {canResale ? (
              <Button
                type="button"
                variant="ghost"
                disabled={resale.pending}
                onClick={() => setResaleConfirmOpen(true)}
                className="h-11 w-full rounded-xl text-muted-foreground"
              >
                <Tag className="size-4" aria-hidden="true" />
                Vender
              </Button>
            ) : null}
            {resalePending ? (
              <Button
                type="button"
                variant="outline"
                disabled={resale.pending || !resale.listingId}
                onClick={resale.withdraw}
                className="h-11 w-full rounded-xl"
              >
                {resale.pending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 className="size-4" aria-hidden="true" />
                )}
                Sacar de la venta
              </Button>
            ) : null}
          </>
        )}
      </div>

      {canShowQr ? (
        <QrScanLightbox
          open={qrOpen}
          onOpenChange={setQrOpen}
          isStatic={isStatic}
          ticketId={ticket.id}
          totpSecret={totpSecret}
          title={walletQrModalTitle(ticket, placeLabel)}
          holderName={ticket.holderName}
          holderDni={ticket.holderDni}
          isTest={ticket.isTest}
        />
      ) : null}
      <TransferShareConfirmDialog
        open={transferConfirmOpen}
        onOpenChange={setTransferConfirmOpen}
        eventTitle={ticket.eventTitle}
        pending={transfer.pending}
        onConfirm={() => {
          setTransferConfirmOpen(false)
          transfer.sendToFriend(ticket.id, ticket.eventTitle)
        }}
      />
      {canSell ? (
        <ResaleConfirmDialog
          open={resaleConfirmOpen}
          onOpenChange={setResaleConfirmOpen}
          eventTitle={ticket.eventTitle}
          nominalValue={ticket.tierPrice}
          pending={resale.pending}
          onConfirm={() => {
            setResaleConfirmOpen(false)
            resale.publish(ticket.id)
          }}
        />
      ) : null}
    </article>
  )
}
