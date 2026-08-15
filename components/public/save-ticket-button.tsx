"use client"

import { Download, LoaderCircle, Smartphone } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { MyTicket } from "@/app/actions/tickets"
import { WalletPassButtons } from "@/components/account/wallet-pass-buttons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { upsertTicketsOffline } from "@/lib/offline-store"
import { requestTicketAssetCache } from "@/lib/wallet-cache"

export function SaveTicketButton({
  ticket,
  userId,
  disabled = false,
  appleWalletEnabled = false,
  googleWalletEnabled = false,
}: {
  ticket: MyTicket
  userId: string
  disabled?: boolean
  appleWalletEnabled?: boolean
  googleWalletEnabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function persistLocal() {
    startTransition(async () => {
      try {
        await upsertTicketsOffline(userId, [ticket])
        toast.success("Entrada en billetera offline", {
          description: "QR dinámico listo sin señal en este dispositivo.",
        })
      } catch {
        toast.error("No se pudo guardar offline en este dispositivo")
      }
    })
  }

  function persistBeforePrint() {
    void upsertTicketsOffline(userId, [ticket]).catch(() => {})
    requestTicketAssetCache([
      ticket.flyerUrl,
      `/tickets/${ticket.id}/print`,
      "/cuenta/entradas",
      "/offline/billetera",
    ])
  }

  return (
    <>
      <Button
        type="button"
        disabled={disabled || isPending}
        onClick={() => setOpen(true)}
        className="h-11 w-full rounded-full bg-white text-zinc-950 hover:bg-zinc-200"
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Smartphone className="size-4" />
        )}
        Guardar entrada
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar entrada</DialogTitle>
            <DialogDescription>
              El QR dinámico también queda disponible en Mis entradas, incluso
              sin conexión.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={persistLocal}
              className="h-12 justify-start rounded-2xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              <Smartphone className="size-4" />
              Guardar en la billetera web
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl"
              nativeButton={false}
              render={<Link href={`/tickets/${ticket.id}/print`} />}
              onClick={persistBeforePrint}
            >
              <Download className="size-4" />
              Descargar PDF
            </Button>

            <WalletPassButtons
              ticketId={ticket.id}
              flyerUrl={ticket.flyerUrl}
              appleWalletEnabled={appleWalletEnabled}
              googleWalletEnabled={googleWalletEnabled}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
