"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { TOKEPASS_PRINT_DONE_MESSAGE } from "@/lib/pos-thermal-print"
import { Printer } from "lucide-react"

export function PrintTicketActions({
  autoPrint = false,
}: {
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

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
    >
      <Printer className="size-4" aria-hidden="true" />
      Imprimir ticket
    </Button>
  )
}
