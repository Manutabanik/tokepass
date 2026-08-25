"use client"

import { useState } from "react"

import {
  updateEventV2,
  type UpdateEventV2Result,
} from "@/app/actions/event-v2"

type EventV2FormProps = {
  eventId: string
  title: string
  ticketId: string
  ticketName: string
  price: number
  stock: number
}

export function EventV2Form({
  eventId,
  title,
  ticketId,
  ticketName,
  price,
  stock,
}: EventV2FormProps) {
  const [result, setResult] = useState<UpdateEventV2Result | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setResult(null)
    try {
      const formData = new FormData(event.currentTarget)
      const response = await updateEventV2(formData)
      setResult(response)
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : String(error),
        details: null,
        code: "CLIENT_THROW",
        step: "client.onSubmit",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="ticketName" value={ticketName} />

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Nombre del evento</span>
        <input
          name="title"
          type="text"
          defaultValue={title}
          required
          className="w-full rounded border border-zinc-400 bg-white px-3 py-2 text-zinc-900"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Precio de la entrada general</span>
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={price}
          required
          className="w-full rounded border border-zinc-400 bg-white px-3 py-2 text-zinc-900"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Stock de la entrada general</span>
        <input
          name="stock"
          type="number"
          step="1"
          min="0"
          defaultValue={stock}
          required
          className="w-full rounded border border-zinc-400 bg-white px-3 py-2 text-zinc-900"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar V2"}
      </button>

      {result ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded border-4 border-red-600 bg-red-50 p-4 text-sm text-red-900">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </form>
  )
}
