"use client"

import { CheckCircle2, FileWarning, LoaderCircle, Undo2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { submitWithdrawalRequest } from "@/app/actions/withdrawal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function WithdrawalForm() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<
    | { ok: true; moneyMoved: boolean }
    | { ok: false; error: string }
    | null
  >(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const orderId = String(data.get("orderId") ?? "").trim()
    const email = String(data.get("email") ?? "").trim()
    const reason = String(data.get("reason") ?? "").trim()

    if (!orderId || !email) {
      toast.error("Completá el número de orden y el correo de la compra.")
      return
    }

    startTransition(async () => {
      const response = await submitWithdrawalRequest({
        orderId,
        email,
        reason,
      })
      if (!response.success) {
        setResult({ ok: false, error: response.error })
        toast.error(response.error)
        return
      }
      setResult({ ok: true, moneyMoved: response.moneyMoved })
      toast.success(
        response.moneyMoved
          ? "Solicitud aprobada y devolución enviada"
          : "Entradas anuladas. La devolución quedó en proceso",
      )
    })
  }

  if (result?.ok) {
    return (
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-8 text-center">
        <CheckCircle2
          className="mx-auto size-8 text-emerald-600 dark:text-emerald-300"
          aria-hidden="true"
        />
        <p className="mt-3 text-lg font-bold text-foreground">
          Solicitud aprobada
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.moneyMoved
            ? "Anulamos los códigos QR y enviamos la devolución a la pasarela de pago."
            : "Anulamos los códigos QR de inmediato. La devolución del dinero queda en proceso con la pasarela de pago."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 min-h-12 rounded-xl px-5"
          onClick={() => setResult(null)}
        >
          Enviar otra solicitud
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {result && !result.ok ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{result.error}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="orderId">Número de orden</Label>
        <Input
          id="orderId"
          name="orderId"
          required
          autoComplete="off"
          placeholder="Ej. 3f8a1c2e-…"
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
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-emerald-500 px-5 font-semibold text-black hover:bg-emerald-600"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Undo2 className="size-4" aria-hidden="true" />
        )}
        Solicitar Cancelación
      </Button>
    </form>
  )
}
