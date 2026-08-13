"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  assignEventStaff,
  revokeEventStaff,
  type StaffAssignmentRow,
} from "@/app/actions/event-staff"
import type { OrganizerEvent } from "@/app/actions/events"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EVENT_STAFF_ROLES, type EventStaffRole } from "@/types/auth"

const ROLE_LABEL: Record<EventStaffRole, string> = {
  door_staff: "Puerta (scanner)",
  bar_staff: "Barra",
  cashier: "Caja / POS",
}

export function EventStaffManager({
  events,
  assignments,
}: {
  events: OrganizerEvent[]
  assignments: StaffAssignmentRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [eventId, setEventId] = useState(events[0]?.id ?? "")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<EventStaffRole>("door_staff")

  const sorted = useMemo(
    () =>
      [...assignments].sort((a, b) =>
        a.eventTitle.localeCompare(b.eventTitle),
      ),
    [assignments],
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
          Equipo
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
          Staff por evento
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Delegá puerta, barra o caja sin compartir tu cuenta de organizador.
          El staff solo ve las herramientas de su rol.
        </p>
      </div>

      <form
        className="grid gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 p-5 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          startTransition(async () => {
            const result = await assignEventStaff({ eventId, email, role })
            if (!result.success) {
              toast.error(result.error)
              return
            }
            toast.success("Staff asignado")
            setEmail("")
            router.refresh()
          })
        }}
      >
        <div className="space-y-2 lg:col-span-1">
          <Label htmlFor="staff-event">Evento</Label>
          <select
            id="staff-event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white"
            required
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-email">Email del usuario</Label>
          <Input
            id="staff-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@ejemplo.com"
            className="border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Rol</Label>
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value as EventStaffRole)}
            className="flex h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-white"
          >
            {EVENT_STAFF_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={pending || !eventId || events.length === 0}
            className="h-10 w-full rounded-full bg-violet-600 text-white hover:bg-violet-500"
          >
            {pending ? "Asignando…" : "Asignar"}
          </Button>
        </div>
      </form>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
          Todavía no hay staff delegado.
        </div>
      ) : (
        <div className="grid gap-2">
          {sorted.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-white">
                  {row.userName ?? row.userEmail}
                </p>
                <p className="text-sm text-zinc-500">
                  {row.userEmail} · {row.eventTitle} · {ROLE_LABEL[row.role]}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-600 dark:text-zinc-400"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await revokeEventStaff(row.id)
                    if (!result.success) {
                      toast.error(result.error)
                      return
                    }
                    toast.success("Acceso revocado")
                    router.refresh()
                  })
                }}
              >
                Revocar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
