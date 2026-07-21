"use client"

import { LoaderCircle, Search, UserCheck } from "lucide-react"
import { useMemo, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ScannerManifestTicket } from "@/lib/offline-scanner-store"
import { searchManifestTickets } from "@/lib/offline-scanner-store"
import { cn } from "@/lib/utils"

export function EmergencyTicketSearch({
  eventId,
  open,
  onOpenChange,
  onValidate,
}: {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onValidate: (ticket: ScannerManifestTicket) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ScannerManifestTicket[]>([])
  const [isPending, startTransition] = useTransition()

  function handleQuery(value: string) {
    setQuery(value)
    startTransition(async () => {
      if (!eventId || value.trim().length < 2) {
        setResults([])
        return
      }
      const matches = await searchManifestTickets(eventId, value)
      setResults(matches)
    })
  }

  const emptyHint = useMemo(() => {
    if (query.trim().length < 2) {
      return "Escribí al menos 2 caracteres (nombre o DNI)."
    }
    if (!isPending && results.length === 0) {
      return "Sin coincidencias en el manifiesto local."
    }
    return null
  }, [query, isPending, results.length])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-hidden border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buscador de emergencia</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Filtra el manifiesto offline por nombre o DNI. Un tap valida.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => handleQuery(event.target.value)}
            placeholder="Nombre, apellido o DNI"
            autoFocus
            className="h-14 rounded-2xl border-zinc-700 bg-black pl-10 text-base text-white"
          />
        </div>

        <div className="max-h-[50dvh] space-y-2 overflow-y-auto pr-1">
          {isPending ? (
            <p className="flex items-center gap-2 py-6 text-sm text-zinc-400">
              <LoaderCircle className="size-4 animate-spin" />
              Buscando…
            </p>
          ) : null}

          {emptyHint ? (
            <p className="py-6 text-center text-sm text-zinc-500">{emptyHint}</p>
          ) : null}

          {results.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onValidate(ticket)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                ticket.status === "valid"
                  ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
                  : "border-zinc-800 bg-zinc-900 opacity-80",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/40 text-emerald-300">
                <UserCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-white">
                  {ticket.owner_name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-zinc-400">
                  {ticket.ticket_tier}
                  {ticket.dni ? ` · DNI ${ticket.dni}` : ""}
                  {ticket.status !== "valid" ? ` · ${ticket.status}` : ""}
                </span>
              </span>
              {ticket.status === "valid" ? (
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                  Validar
                </span>
              ) : (
                <span className="text-xs font-bold uppercase tracking-wide text-red-300">
                  Usada
                </span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
