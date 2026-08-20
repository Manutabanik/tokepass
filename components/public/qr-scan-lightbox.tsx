"use client"

import { Maximize2, X } from "lucide-react"
import type { ReactNode } from "react"

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

export function QrScanLightbox({
  open,
  onOpenChange,
  isStatic,
  ticketId,
  totpSecret,
  holderName,
  holderDni,
  caption = "Acercá este código al escáner de ingreso",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isStatic: boolean
  ticketId: string
  totpSecret: string
  holderName?: string | null
  holderDni?: string | null
  caption?: string
}) {
  const backup = ticketBackupCode(ticketId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[100] bg-zinc-950/96 backdrop-blur-xl"
        className="pointer-events-none fixed inset-0 top-0 left-0 isolate z-[110] flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center overflow-y-auto overscroll-contain rounded-none bg-transparent p-4 text-zinc-950 shadow-none ring-0 sm:max-w-none sm:p-6"
      >
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pointer-events-auto absolute top-3 right-3 z-10 rounded-full text-white hover:bg-white/10 hover:text-white"
            />
          }
        >
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Cerrar</span>
        </DialogClose>

        <DialogTitle className="sr-only">Código de ingreso</DialogTitle>
        <DialogDescription className="sr-only">{caption}</DialogDescription>

        <div className="pointer-events-auto relative z-[110] flex w-full max-w-md flex-col items-center justify-center py-8">
          <div
            className="flex w-full flex-col items-center bg-white p-6 rounded-xl shadow-2xl text-zinc-950"
            style={{ colorScheme: "light" }}
          >
            <div className="size-[min(20rem,calc(100vw-5rem))] bg-white">
              {isStatic ? (
                <StaticSignedQR
                  ticketId={ticketId}
                  totpSecret={totpSecret}
                  size={320}
                  className="aspect-square size-full max-w-none bg-white p-0 shadow-none"
                />
              ) : (
                <LivingTicketQR
                  ticketId={ticketId}
                  totpSecret={totpSecret}
                  size={320}
                  variant="scan"
                  className="size-full max-w-none bg-white"
                />
              )}
            </div>
            <p className="mt-5 font-mono text-sm font-semibold tracking-[0.22em] text-zinc-800">
              {backup}
            </p>
            {holderName ? (
              <p className="mt-3 text-center text-base font-bold text-zinc-950">
                {holderName}
              </p>
            ) : null}
            {holderDni ? (
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-600">
                DNI {holderDni}
              </p>
            ) : null}
          </div>
          <p className="mt-5 max-w-xs text-center text-sm font-semibold text-white">
            {caption}
          </p>
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
