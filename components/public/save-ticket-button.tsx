"use client"

import { Download, LoaderCircle, Smartphone } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { MyTicket } from "@/app/actions/tickets"
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
  /** Solo true si el server tiene PassKit/certs reales + flag público. */
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
          description: "Living QR listo sin señal en este dispositivo.",
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
      "/my-tickets",
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
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar entrada</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Opciones reales disponibles hoy. El Living QR también vive en Mis
              Entradas / PWA.
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
              Abrir Billetera Web (PWA)
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
              nativeButton={false}
              render={<Link href={`/tickets/${ticket.id}/print`} />}
              onClick={persistBeforePrint}
            >
              <Download className="size-4" />
              Descargar PDF
            </Button>

            {appleWalletEnabled ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
                nativeButton={false}
                render={
                  <a href={`/api/tickets/${ticket.id}/apple-pass`} />
                }
                onClick={persistBeforePrint}
              >
                Apple Wallet
              </Button>
            ) : null}

            {googleWalletEnabled ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
                nativeButton={false}
                render={
                  <a href={`/api/tickets/${ticket.id}/google-wallet`} />
                }
                onClick={persistBeforePrint}
              >
                Google Wallet
              </Button>
            ) : null}
          </div>

          {!appleWalletEnabled && !googleWalletEnabled ? (
            <p className="text-[11px] leading-4 text-zinc-500">
              Apple Wallet / Google Wallet no están configurados en este entorno.
              Usá la billetera PWA o el PDF.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
