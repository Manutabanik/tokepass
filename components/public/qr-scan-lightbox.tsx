"use client"

import { Maximize2, Radio, X } from "lucide-react"
import type { ReactNode } from "react"

import { LivingStoreQR } from "@/components/public/living-store-qr"
import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { StaticSignedQR } from "@/components/public/static-signed-qr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { ticketBackupCode } from "@/lib/ticket-print"
import { cn, tapFeedbackClass } from "@/lib/utils"

function CloseQrButton({
  className,
}: {
  className?: string
}) {
  return (
    <DialogClose
      render={
        <Button
          type="button"
          variant="outline"
          className={cn(
            "pointer-events-auto h-11 gap-2 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white",
            className,
          )}
        />
      }
    >
      <X className="size-4" aria-hidden="true" />
      Cerrar
    </DialogClose>
  )
}

export function QrScanLightbox({
  open,
  onOpenChange,
  isStatic,
  ticketId,
  totpSecret,
  holderName,
  holderDni,
  caption = "Acercá este código al escáner de ingreso",
  kind = "door",
  title,
  isSandbox = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isStatic: boolean
  ticketId: string
  totpSecret: string
  holderName?: string | null
  holderDni?: string | null
  caption?: string
  kind?: "door" | "store"
  title?: string
  /** Sandbox orders get the red banner whatever the scanned item is. */
  isSandbox?: boolean
}) {
  const isStore = kind === "store"
  const living = !isStatic
  const backup = ticketBackupCode(ticketId)
  const heading =
    title?.trim() || (isStore ? "Canje" : "Código de ingreso")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[100] bg-zinc-950/96 backdrop-blur-xl"
        className="pointer-events-none fixed inset-0 top-0 left-0 isolate z-[110] flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center overflow-y-auto overscroll-contain rounded-none bg-transparent p-4 text-zinc-950 shadow-none ring-0 sm:max-w-none sm:p-6"
      >
        <div className="pointer-events-auto relative z-[110] flex w-full max-w-md flex-col py-6">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {living ? (
                <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  <Radio className="size-3.5" aria-hidden="true" />
                  Living QR
                </p>
              ) : (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  QR estático
                </p>
              )}
              <DialogTitle className="text-left text-lg font-bold leading-snug text-white">
                {heading}
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-sm font-medium text-zinc-300">
                {caption}
              </DialogDescription>
            </div>
            <CloseQrButton className="shrink-0" />
          </header>

          <div
            className="relative flex w-full flex-col items-center rounded-2xl bg-white p-5 text-zinc-950 shadow-2xl"
            style={{ colorScheme: "light" }}
          >
            <div className="w-[min(20rem,calc(100vw-5rem))] max-w-full bg-white">
              {isStore ? (
                <LivingStoreQR
                  token={ticketId}
                  size={320}
                  variant="scan"
                  className="w-full max-w-none bg-white"
                />
              ) : isStatic ? (
                <StaticSignedQR
                  ticketId={ticketId}
                  totpSecret={totpSecret}
                  size={320}
                  className="aspect-square w-full max-w-none bg-white p-0 shadow-none"
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticketId}
                  totpSecret={totpSecret}
                  size={320}
                  variant="scan"
                  className="w-full max-w-none bg-white"
                />
              )}
            </div>

            <div className="mt-4 flex w-full flex-col items-center gap-2">
              <p className="font-mono text-sm font-semibold tracking-[0.22em] text-zinc-800">
                {backup}
              </p>
              {holderName || holderDni ? (
                <div className="flex flex-col items-center">
                  {holderName ? (
                    <p className="text-center text-base font-bold text-zinc-950">
                      {holderName}
                    </p>
                  ) : null}
                  {holderDni ? (
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-600">
                      DNI {holderDni}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isSandbox ? (
                <p className="w-full rounded-xl bg-red-600 px-3 py-2 text-center text-[11px] font-black uppercase tracking-[0.16em] text-white">
                  Modo prueba · sin validez
                </p>
              ) : null}
            </div>
          </div>

          <CloseQrButton className="mt-5 w-full justify-center" />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function QrEnlargeTrigger({
  children,
  onOpen,
  disabled = false,
  className,
}: {
  children: ReactNode
  onOpen: () => void
  disabled?: boolean
  className?: string
}) {
  if (disabled) return children

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onOpen()
          }
        }}
        title="Tocar para agrandar QR"
        aria-label="Tocar para agrandar QR"
        className={cn(
          tapFeedbackClass,
          "cursor-pointer rounded-[1.35rem] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="no-print mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
      >
        <Maximize2 className="size-3.5" aria-hidden="true" />
        Tocar para agrandar QR
      </button>
    </div>
  )
}
