"use client"

import { LoaderCircle, Ticket } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { claimTicketTransferAction } from "@/app/actions/transfer"
import { Button } from "@/components/ui/button"

export function ClaimTicketView({
  token,
  eventTitle,
  eventDateLabel,
  flyerUrl,
  emailMatches,
  alreadyOwner,
  status,
}: {
  token: string
  eventTitle: string
  /** Ya formateado en el servidor: el cliente no debe reformatear la fecha. */
  eventDateLabel: string | null
  flyerUrl: string | null
  emailMatches: boolean
  alreadyOwner: boolean
  status: "pending" | "accepted" | "cancelled"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [claimed, setClaimed] = useState(alreadyOwner && status === "accepted")

  function handleClaim() {
    if (isPending) return
    startTransition(async () => {
      const result = await claimTicketTransferAction(token)
      if (!result.success) {
        if (result.loginUrl) {
          router.push(result.loginUrl)
          return
        }
        toast.error(result.error)
        return
      }
      setClaimed(true)
      toast.success("Entrada reclamada", {
        description: "Ya está en tu billetera TokePass.",
      })
      router.refresh()
    })
  }

  const canAccept = status === "pending" && emailMatches && !claimed

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-emerald-500/15 blur-3xl"
        aria-hidden="true"
      />
      {flyerUrl ? (
        <div
          className="mb-5 h-36 overflow-hidden rounded-2xl bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url(${flyerUrl})` }}
        />
      ) : (
        <div className="mb-5 grid h-36 place-items-center rounded-2xl bg-muted">
          <Ticket className="size-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
        Reclamar entrada
      </p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
        {eventTitle}
      </h1>
      {eventDateLabel ? (
        <p className="mt-1 text-sm text-muted-foreground">{eventDateLabel}</p>
      ) : null}

      {status === "cancelled" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          El envío fue cancelado. Pedile a quien te la transfirió que la vuelva a
          enviar.
        </p>
      ) : alreadyOwner && status === "pending" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Esta entrada sigue en tu billetera. El QR está oculto hasta que tu
          amigo la acepte o canceles el envío.
        </p>
      ) : !emailMatches ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Esta entrada fue enviada a otro email. Ingresá con la cuenta
          destinataria para reclamarla.
        </p>
      ) : claimed || status === "accepted" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Esta entrada ya está en tu billetera.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Al aceptar, la titularidad pasa a tu cuenta TokePass y el código de
          acceso se genera en tu teléfono.
        </p>
      )}

      <div className="mt-6 grid gap-3">
        {canAccept ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={handleClaim}
            className="h-12 w-full rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            {isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            {isPending ? "Reclamando…" : "Aceptar entrada"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-12 w-full rounded-full"
          nativeButton={false}
          render={<Link href="/profile/tickets" />}
        >
          Ir a Mis entradas
        </Button>
      </div>
    </article>
  )
}
