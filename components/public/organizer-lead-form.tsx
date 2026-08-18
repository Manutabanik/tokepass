"use client"

import { CheckCircle2, LoaderCircle } from "lucide-react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  submitOrganizerLead,
  type OrganizerLeadState,
} from "@/app/actions/organizer-leads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: OrganizerLeadState = {
  error: null,
  success: null,
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-12 w-full min-h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : null}
      {pending ? "Enviando..." : "Solicitar acceso"}
    </Button>
  )
}

export function OrganizerLeadForm({
  whatsappHref,
}: {
  whatsappHref: string | null
}) {
  const [state, action] = useActionState(submitOrganizerLead, initialState)

  if (state.success) {
    return (
      <div
        role="status"
        className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-100"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-6">{state.success}</p>
        </div>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 min-h-12 w-full items-center justify-center rounded-full bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
          >
            Escribinos por WhatsApp
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="lead-name" className="text-zinc-200">
          Nombre
        </Label>
        <Input
          id="lead-name"
          name="fullName"
          autoComplete="name"
          required
          minLength={2}
          placeholder="Tu nombre y apellido"
          className="h-12 min-h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label htmlFor="lead-email" className="text-zinc-200">
            Email
          </Label>
          <Input
            id="lead-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="nina.v@example.com"
            className="h-12 min-h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lead-phone" className="text-zinc-200">
            Telefono
          </Label>
          <Input
            id="lead-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            inputMode="tel"
            placeholder="11 2345 6789"
            className="h-12 min-h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lead-event" className="text-zinc-200">
          Nombre del evento
        </Label>
        <Input
          id="lead-event"
          name="eventName"
          required
          minLength={2}
          placeholder="Fiesta, festival o ciclo"
          className="h-12 min-h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lead-attendance" className="text-zinc-200">
          Asistencia estimada
        </Label>
        <Input
          id="lead-attendance"
          name="estimatedAttendance"
          type="number"
          required
          min={1}
          max={200000}
          placeholder="800"
          className="h-12 min-h-12 border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
      <p className="text-xs leading-5 text-zinc-500">
        El alta de productoras es asistida. No hay autorregistro: validamos
        cada cuenta antes de abrir el panel.
      </p>
    </form>
  )
}
