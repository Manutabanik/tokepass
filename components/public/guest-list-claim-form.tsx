"use client"

import { LoaderCircle, Ticket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  claimFreePass,
  registerPublicGuest,
  type GuestListPublicMeta,
} from "@/app/actions/guest-lists"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatEventDate, formatNumber } from "@/lib/format"

export function GuestListClaimForm({
  meta,
  initialEntryId,
  isAuthenticated,
}: {
  meta: GuestListPublicMeta
  initialEntryId?: string | null
  isAuthenticated: boolean
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleClaimExisting() {
    if (!initialEntryId) return
    startTransition(async () => {
      const result = await claimFreePass(initialEntryId)
      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(
            `/login?next=/lists/claim/${meta.id}?entry=${initialEntryId}`,
          )
          return
        }
        toast.error(result.error)
        return
      }
      toast.success("FreePass canjeado", {
        description: "Ya está en tu billetera Tokepass.",
      })
      router.push("/cuenta/entradas")
    })
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await registerPublicGuest({
        listId: meta.id,
        fullName,
        email,
        phone,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setDone(true)

      if (result.data.ticketId) {
        toast.success("¡Listo! FreePass en tu billetera")
        router.push("/cuenta/entradas")
        return
      }

      toast.success("Te anotaste en la lista", {
        description: "Ingresá para canjear el QR de tu entrada.",
      })
      router.push(
        `/login?next=/lists/claim/${meta.id}?entry=${result.data.entryId}`,
      )
    })
  }

  if (meta.remaining <= 0 && !initialEntryId) {
    return (
      <div className="rounded-[1.75rem] border border-border bg-card px-5 py-10 text-center">
        <p className="text-lg font-bold text-foreground">Lista completa</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No quedan cupos en {meta.name}.
        </p>
      </div>
    )
  }

  if (initialEntryId && isAuthenticated) {
    return (
      <div className="space-y-4 rounded-[1.75rem] border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Tenés una cortesía pendiente en <strong>{meta.name}</strong>.
        </p>
        <Button
          type="button"
          disabled={isPending}
          onClick={handleClaimExisting}
          className="h-12 w-full rounded-2xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
        >
          {isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <>
              <Ticket className="size-4" />
              Canjear FreePass
            </>
          )}
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="rounded-[1.75rem] border border-emerald-500/30 bg-emerald-500/10 px-5 py-10 text-center">
        <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">Registro enviado</p>
        <p className="mt-2 text-sm text-emerald-800/70 dark:text-emerald-100/70">
          Revisá tu WhatsApp/email o ingresá para ver el QR.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-[1.75rem] border border-border bg-card p-5"
    >
      <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Cupos restantes
        </p>
        <p className="mt-1 text-3xl font-black text-foreground">
          {formatNumber(meta.remaining)}
          <span className="text-base font-medium text-muted-foreground">
            {" "}
            / {formatNumber(meta.maxGuests)}
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (obligatorio)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11"
        />
        <p className="text-xs text-zinc-500">
          El FreePass queda vinculado a este email. Debés ingresar con la misma
          cuenta para canjearlo.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">WhatsApp</Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11 …"
          className="h-11"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-12 w-full rounded-2xl bg-violet-600 font-bold text-white hover:bg-violet-500"
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          "Confirmar asistencia"
        )}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Evento: {meta.eventTitle} · {formatEventDate(meta.eventDate)}
      </p>
    </form>
  )
}
