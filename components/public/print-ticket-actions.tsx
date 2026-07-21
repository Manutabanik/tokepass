"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

export function PrintTicketActions() {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
    >
      <Printer className="size-4" aria-hidden="true" />
      Imprimir / PDF
    </Button>
  )
}
