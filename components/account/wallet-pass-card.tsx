"use client"

import { LoaderCircle, QrCode, Send, Tag, Undo2 } from "lucide-react"
import { useState } from "react"

import type { MyTicket } from "@/app/actions/tickets"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { ResaleConfirmDialog } from "@/components/public/resale-confirm-dialog"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import { TransferShareConfirmDialog } from "@/components/public/transfer-share-confirm-dialog"
import { useTicketResaleVisual } from "@/components/public/use-ticket-resale-visual"
import { useTicketTransferVisual } from "@/components/public/use-ticket-transfer-visual"
import { Button } from "@/components/ui/button"
import { isOnlineDelivery } from "@/lib/events/delivery-mode"
import { formatEventDay } from "@/lib/format"
import { cn } from "@/lib/utils"

const QR_NOTICE =
  "El código se actualiza automáticamente. Capturas de pantalla no válidas"

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
        <p className="truncate text-sm font-bold tracking-tight text-foreground">
          {placeLabel}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {ticket.eventTitle}
          {ticket.dayValidityLabel ? ` · ${ticket.dayValidityLabel}` : null}
          {` · ${formatEventDay(ticket.eventDate)}`}
        </p>
      </div>

      {qrOpen && canShowQr ? (
        <div className="relative overflow-hidden bg-zinc-950 px-4 py-5">
          <div className="relative mx-auto w-full max-w-[220px]">
            {isStatic ? (
              <StaticSignedQR
                ticketId={ticket.id}
                totpSecret={totpSecret}
                size={200}
              />
            ) : (
              <LivingTicketQR
                ticketId={ticket.id}
                totpSecret={totpSecret}
                size={200}
                notice={QR_NOTICE}
              />
            )}
            {ticket.isTest ? (
              <div
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="-rotate-12 w-[160%] bg-red-600/70 py-2 text-center text-[11px] font-black uppercase tracking-[0.18em] text-white">
                  MODO PRUEBA - SIN VALIDEZ
                </div>
              </div>
            ) : null}
          </div>
          {isStatic ? (
            <p className="mt-3 text-center text-xs font-medium text-zinc-300">
              {QR_NOTICE}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex w-full flex-col gap-2 p-4 pt-0">
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
            className="h-12 w-full rounded-xl"
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
              onClick={() => setQrOpen((open) => !open)}
              className="h-12 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <QrCode className="size-4" aria-hidden="true" />
              {qrOpen ? "Ocultar QR" : "Mostrar QR"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canTransfer}
              onClick={() => setTransferConfirmOpen(true)}
              className="h-12 w-full rounded-xl border-border bg-background"
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
