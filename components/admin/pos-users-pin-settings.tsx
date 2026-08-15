"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { setCashierPosSecurityPin } from "@/app/actions/event-staff"
import type { StaffAssignmentRow } from "@/app/actions/event-staff"
import {
  setPosSupervisorPin,
  type PosEventOption,
} from "@/app/actions/pos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PosUsersPinSettings({
  events,
  assignments,
}: {
  events: PosEventOption[]
  assignments: StaffAssignmentRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [eventId, setEventId] = useState(events[0]?.id ?? "")
  const [supervisorPin, setSupervisorPin] = useState("")
  const [cashierPins, setCashierPins] = useState<Record<string, string>>({})

  const cashiers = useMemo(
    () =>
      assignments.filter(
        (row) => row.role === "cashier" && (!eventId || row.eventId === eventId),
      ),
    [assignments, eventId],
  )

  const selectedEvent = events.find((event) => event.id === eventId) ?? null

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
          Seguridad POS
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
          PIN de caja
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Configura el PIN de autorizacion del evento y el PIN de 4 digitos de
          cada cajero. Sin este dato, el boton PIN del POS no puede validar al
          personal de ventanilla.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pin-event">Evento / punto de venta</Label>
          <select
            id="pin-event"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value)
              setSupervisorPin("")
            }}
            className="flex h-10 w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 text-sm text-foreground dark:border-zinc-700 dark:bg-zinc-900"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!eventId) return
            startTransition(async () => {
              const result = await setPosSupervisorPin({
                eventId,
                pin: supervisorPin,
              })
              if (!result.success) {
                toast.error(result.error)
                return
              }
              toast.success("PIN de autorizacion guardado")
              setSupervisorPin("")
              router.refresh()
            })
          }}
        >
          <Label htmlFor="supervisor-pin">PIN de autorizacion (4 digitos)</Label>
          <div className="flex gap-2">
            <Input
              id="supervisor-pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={supervisorPin}
              onChange={(e) =>
                setSupervisorPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder={
                selectedEvent?.hasSupervisorPin ? "****" : "0000"
              }
              className="border-zinc-300 bg-zinc-100 font-mono tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
            />
            <Button
              type="submit"
              disabled={pending || supervisorPin.length !== 4}
              className="shrink-0 rounded-full bg-violet-600 text-white hover:bg-violet-500"
            >
              {pending ? <LoaderCircle className="animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">
          PIN de cajero (posSecurityPin)
        </p>
        {cashiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cajeros asignados a este evento. Asignalos abajo en Staff.
          </p>
        ) : (
          <ul className="space-y-2">
            {cashiers.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-950/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {row.userName ?? row.userEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.userEmail} · {row.eventTitle} ·{" "}
                    {row.hasPosSecurityPin ? "PIN activo" : "Sin PIN"}
                  </p>
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const pin = cashierPins[row.id] ?? ""
                    startTransition(async () => {
                      const result = await setCashierPosSecurityPin({
                        assignmentId: row.id,
                        pin,
                      })
                      if (!result.success) {
                        toast.error(result.error)
                        return
                      }
                      toast.success("PIN de cajero actualizado")
                      setCashierPins((current) => ({ ...current, [row.id]: "" }))
                      router.refresh()
                    })
                  }}
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={cashierPins[row.id] ?? ""}
                    onChange={(e) =>
                      setCashierPins((current) => ({
                        ...current,
                        [row.id]: e.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    placeholder={row.hasPosSecurityPin ? "****" : "0000"}
                    className="h-10 w-28 border-zinc-300 bg-white font-mono tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={pending || (cashierPins[row.id] ?? "").length !== 4}
                    className="h-10"
                  >
                    <KeyRound className="size-4" />
                    {row.hasPosSecurityPin ? "Restablecer" : "Crear PIN"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
