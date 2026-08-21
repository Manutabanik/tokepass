"use client"

import { Download, Printer } from "lucide-react"
import { useEffect } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { ticketPdfPath } from "@/lib/pdf/ticket-pdf-model"
import { TOKEPASS_PRINT_DONE_MESSAGE } from "@/lib/pos-thermal-print"
import { cn } from "@/lib/utils"

export function PrintTicketActions({
  ticketId,
  autoPrint = false,
}: {
  ticketId?: string
  autoPrint?: boolean
}) {
  useEffect(() => {
    if (!autoPrint) return

    const timer = window.setTimeout(() => {
      try {
        window.print()
      } finally {
        window.setTimeout(() => {
          window.parent?.postMessage(
            { type: TOKEPASS_PRINT_DONE_MESSAGE },
            window.location.origin,
          )
        }, 400)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [autoPrint])

  const pdfHref = ticketId
    ? ticketPdfPath(ticketId, { size: "a4", download: true })
    : null

  return (
    <div className="no-print print:hidden flex items-center gap-2">
      {pdfHref ? (
        <a
          href={pdfHref}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 rounded-full border-zinc-300 bg-white px-3 text-zinc-950 hover:bg-zinc-100",
          )}
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar PDF
        </a>
      ) : null}
      <Button
        type="button"
        onClick={() => window.print()}
        className="h-10 rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
      >
        <Printer className="size-4" aria-hidden="true" />
        Imprimir ticket
      </Button>
    </div>
  )
}
