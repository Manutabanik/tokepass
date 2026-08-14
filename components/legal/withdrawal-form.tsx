"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function WithdrawalForm() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const orderId = String(data.get("orderId") ?? "").trim()
    const email = String(data.get("email") ?? "").trim()

    if (!orderId || !email) {
      toast.error("Completá el número de orden y el correo de la compra.")
      return
    }

    setSubmitted(true)
    toast.success("Solicitud registrada", {
      description: "Te vamos a contactar al correo de la compra.",
    })
  }

  if (submitted) {
    return (
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-8 text-center">
        <p className="text-lg font-bold text-foreground">
          Recibimos tu solicitud
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Este es un acuse simulado. Cuando el canal esté conectado, el equipo
          de Tokepass revisará el plazo de 10 días y el estado del evento.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 min-h-12 rounded-xl px-5"
          onClick={() => setSubmitted(false)}
        >
          Enviar otra solicitud
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="orderId">Número de orden</Label>
        <Input
          id="orderId"
          name="orderId"
          required
          autoComplete="off"
          placeholder="Ej. 3f8a1c2e…"
          className="min-h-12 rounded-xl px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Lo encontrás en Mis compras o en el correo de confirmación.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico de la compra</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@email.com"
          className="min-h-12 rounded-xl px-3 text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Motivo (opcional)</Label>
        <Textarea
          id="reason"
          name="reason"
          rows={4}
          placeholder="Contanos por qué querés cancelar. No es obligatorio."
          className="min-h-28 rounded-xl px-3 py-3 text-sm"
        />
      </div>

      <Button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-emerald-500 px-5 font-semibold text-black hover:bg-emerald-600"
      >
        Solicitar Cancelación
      </Button>
    </form>
  )
}
