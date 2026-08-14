"use client"

import { LoaderCircle, Search, UserCheck, Users } from "lucide-react"
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
import {
  getManifestTicketsByGroup,
  searchManifestTickets,
} from "@/lib/offline-scanner-store"
import { cn } from "@/lib/utils"

export function EmergencyTicketSearch({
  eventId,
  open,
  onOpenChange,
  onValidate,
  onValidateMany,
}: {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onValidate: (ticket: ScannerManifestTicket) => void
  onValidateMany?: (tickets: ScannerManifestTicket[]) => void
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
      return "No encontramos coincidencias en la lista local."
    }
    return null
  }, [query, isPending, results.length])

  async function validateWholeGroup(ticket: ScannerManifestTicket) {
    if (!ticket.group_id || !onValidateMany) {
      onValidate(ticket)
      return
    }
    const group = await getManifestTicketsByGroup(eventId, ticket.group_id)
    const validOnes = group.filter((t) => t.status === "valid")
    if (validOnes.length <= 1) {
      onValidate(ticket)
      return
    }
    onValidateMany(validOnes)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-hidden border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingreso por DNI</DialogTitle>
          <DialogDescription className="text-zinc-600 dark:text-zinc-400">
            Buscá por nombre o DNI. Si es una mesa, podés validar un acceso o
            todos juntos.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600 dark:text-zinc-400" />
          <Input
            value={query}
            onChange={(event) => handleQuery(event.target.value)}
            placeholder="Nombre, apellido o DNI"
            autoFocus
            className="h-14 rounded-2xl border-zinc-300 bg-black pl-10 text-base text-zinc-900 dark:border-zinc-700 dark:text-white"
          />
        </div>

        <div className="max-h-[50dvh] space-y-2 overflow-y-auto pr-1">
          {isPending ? (
            <p className="flex items-center gap-2 py-6 text-sm text-zinc-600 dark:text-zinc-400">
              <LoaderCircle className="size-4 animate-spin" />
              Buscando…
            </p>
          ) : null}

          {emptyHint ? (
            <p className="py-6 text-center text-sm text-slate-600 dark:text-zinc-400">{emptyHint}</p>
          ) : null}

          {results.map((ticket) => (
            <div
              key={ticket.id}
              className={cn(
                "rounded-2xl border px-4 py-3",
                ticket.status === "valid"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-zinc-200 bg-zinc-100 opacity-80 dark:border-zinc-800 dark:bg-zinc-900",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/40 text-emerald-800 dark:text-emerald-300">
                  {ticket.group_id ? (
                    <Users className="size-5" />
                  ) : (
                    <UserCheck className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-zinc-900 dark:text-white">
                    {ticket.owner_name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {ticket.ticket_tier}
                    {ticket.group_slot
                      ? ` · Acceso ${ticket.group_slot}`
                      : ""}
                    {ticket.dni ? ` · DNI ${ticket.dni}` : ""}
                    {ticket.status !== "valid" ? ` · ${ticket.status}` : ""}
                  </span>
                </span>
              </div>
              {ticket.status === "valid" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-10 flex-1 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-500"
                    onClick={() => onValidate(ticket)}
                  >
                    Validar 1
                  </Button>
                  {ticket.group_id && onValidateMany ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10 flex-1 rounded-xl"
                      onClick={() => void validateWholeGroup(ticket)}
                    >
                      Validar mesa
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-red-300">
                  Usada
                </p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
