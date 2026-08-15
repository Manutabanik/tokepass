"use client"

import { Expand, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import type { ReactNode } from "react"

import { LivingTicketQR } from "@/components/public/living-ticket-qr"
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
  caption = "Acercá este código al escáner de ingreso",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isStatic: boolean
  ticketId: string
  totpSecret: string
  caption?: string
}) {
  const backup = ticketBackupCode(ticketId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/95 backdrop-blur-xl"
        className="pointer-events-none fixed inset-0 top-0 left-0 z-50 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center overflow-y-auto overscroll-contain rounded-none bg-transparent p-4 shadow-none ring-0 sm:max-w-none sm:p-6"
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

        <div className="pointer-events-auto flex w-full max-w-md flex-col items-center justify-center py-8">
          <div className="flex w-full flex-col items-center rounded-3xl bg-white p-4 shadow-2xl shadow-primary/20 sm:p-8">
            <div className="w-[min(18rem,calc(100vw-6.5rem),calc(100dvh-22rem))] sm:w-96">
              {isStatic ? (
                <div className="aspect-square w-full">
                  <QRCodeSVG
                    value={totpSecret}
                    size={384}
                    level="H"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#09090b"
                    className="h-auto w-full"
                  />
                </div>
              ) : (
                <LivingTicketQR
                  ticketId={ticketId}
                  totpSecret={totpSecret}
                  size={384}
                  variant="scan"
                  className="max-w-none"
                />
              )}
            </div>
            <p className="mt-4 font-mono text-xs tracking-[0.22em] text-zinc-500">
              {backup}
            </p>
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
    <button
      type="button"
      onClick={onOpen}
      title="Tocar para agrandar"
      aria-label="Tocar para agrandar el código QR"
      className={cn(
        tapFeedbackClass,
        "flex cursor-pointer flex-col items-center rounded-[1.35rem] transition-transform hover:scale-105",
        className,
      )}
    >
      {children}
      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Expand className="size-3" aria-hidden="true" />
        Tocar para agrandar
      </span>
    </button>
  )
}
