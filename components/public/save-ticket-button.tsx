"use client"

import {
  Download,
  LoaderCircle,
  Smartphone,
  Wallet,
} from "lucide-react"
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
}: {
  ticket: MyTicket
  userId: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function persistLocal() {
    startTransition(async () => {
      try {
        await upsertTicketsOffline(userId, [ticket])
        toast.success("Entrada guardada en este teléfono", {
          description: "Lista para usarse sin señal.",
        })
      } catch {
        toast.error("No se pudo guardar offline en este dispositivo")
      }
    })
  }

  function persistBeforeWallet() {
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
        Guardar en Teléfono / Wallet
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar entrada</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Redundancia offline: Wallet nativo, PDF o caché en el dispositivo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={persistLocal}
              className="h-12 justify-start rounded-2xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              <Download className="size-4" />
              Guardar offline en este teléfono
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
              nativeButton={false}
              render={
                <a href={`/api/tickets/${ticket.id}/apple-pass`} />
              }
              onClick={persistBeforeWallet}
            >
              <Wallet className="size-4" />
              Apple Wallet / PDF
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
              nativeButton={false}
              render={
                <a href={`/api/tickets/${ticket.id}/google-wallet`} />
              }
              onClick={persistBeforeWallet}
            >
              <Wallet className="size-4" />
              Google Wallet / PDF
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
              nativeButton={false}
              render={<Link href={`/tickets/${ticket.id}/print`} />}
              onClick={persistBeforeWallet}
            >
              <Download className="size-4" />
              Descargar PDF / imprimir
            </Button>
          </div>

          <p className="text-[11px] leading-4 text-zinc-500">
            Si Apple/Google Wallet no está configurado en el servidor, te
            llevamos automáticamente a la vista PDF lista para guardar en Fotos
            o Archivos.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
