"use client"

import { KeyRound, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { WALLET_PATH, loginUrlWithNext } from "@/lib/auth/next-path"
import {
  getOfflineActiveUserId,
  getTicketsOffline,
} from "@/lib/offline-store"
import { ticketBackupCode } from "@/lib/ticket-print"

/**
 * Respaldo cuando el link del mail no puede abrir la entrada completa: sin
 * sesión ni acceso de invitado.
 *
 * Muestra el código de respaldo y nada más. El código son los primeros 12
 * caracteres del UUID, que ya viaja en claro dentro de todo payload `TP2.`, así
 * que no expone nada nuevo. La admisión por esta vía la hace el staff contra el
 * manifiesto de la puerta, que refleja transferencias y reventas y muestra
 * nombre y DNI para verificar identidad. Nunca se expone el `totp_secret`.
 */
export function TicketRecoveryCard({ ticketId }: { ticketId: string }) {
  const [cached, setCached] = useState<{
    eventTitle: string
    holderName: string
  } | null>(null)

  const backupCode = ticketBackupCode(ticketId)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const activeUser = await getOfflineActiveUserId()
        const tickets = await getTicketsOffline(activeUser)
        const match = tickets.find((ticket) => ticket.id === ticketId)
        if (cancelled || !match) return
        setCached({
          eventTitle: match.eventTitle,
          holderName: match.holderName,
        })
      } catch {
        // El respaldo funciona igual sin caché local.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ticketId])

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-3xl border border-border bg-card p-6 text-card-foreground">
        <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
          <KeyRound className="size-3.5" aria-hidden="true" />
          Acceso de respaldo
        </p>

        <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
          Mostrá este código en la puerta
        </h1>

        {cached ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {cached.eventTitle} · {cached.holderName}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No pudimos abrir tu entrada completa desde este enlace, pero el
            personal de acceso puede validarla con este código.
          </p>
        )}

        <div className="mt-5 rounded-2xl border border-border bg-muted/40 px-4 py-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Código de respaldo
          </p>
          <p className="mt-2 break-all font-mono text-2xl font-bold tracking-[0.12em] text-foreground">
            {backupCode}
          </p>
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm leading-5 text-muted-foreground">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          Decile tu nombre y este código al personal. Lo buscan en la lista de
          la puerta, que funciona sin internet, y validan tu ingreso a mano.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={loginUrlWithNext(WALLET_PATH)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Iniciar sesión para ver la entrada
          </Link>
          {cached ? (
            <Link
              href={WALLET_PATH}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
            >
              Abrir mi billetera
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
