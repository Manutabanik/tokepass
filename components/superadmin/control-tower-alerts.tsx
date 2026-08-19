import Link from "next/link"
import { Banknote, Clock, MessageSquare } from "lucide-react"

import { cn } from "@/lib/utils"

export function ControlTowerAlerts({
  pendingCount,
  unreadSupportCount,
  pendingPayoutCount,
}: {
  pendingCount: number
  unreadSupportCount: number
  pendingPayoutCount: number
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Link
        href="#auditoria"
        className={cn(
          "rounded-xl border border-border bg-card p-5 transition hover:bg-muted/40",
          pendingCount > 0 && "border-amber-500/35 bg-amber-500/8",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Eventos Pendientes</p>
            <p className="mt-3 text-4xl font-black tabular-nums text-foreground">
              {pendingCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esperan auditoría antes de salir a la venta
            </p>
          </div>
          <span className="grid size-11 place-items-center rounded-xl bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300">
            <Clock className="size-5" aria-hidden="true" />
          </span>
        </div>
      </Link>
      <Link
        href="/superadmin/soporte"
        className={cn(
          "rounded-xl border border-border bg-card p-5 transition hover:bg-muted/40",
          unreadSupportCount > 0 && "border-violet-500/35 bg-violet-500/8",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Soporte Sin Responder</p>
            <p className="mt-3 text-4xl font-black tabular-nums text-foreground">
              {unreadSupportCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Chats con mensajes del organizador
            </p>
          </div>
          <span className="grid size-11 place-items-center rounded-xl bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/25 dark:text-violet-300">
            <MessageSquare className="size-5" aria-hidden="true" />
          </span>
        </div>
      </Link>
      <Link
        href="/superadmin/settlements"
        className={cn(
          "rounded-xl border border-border bg-card p-5 transition hover:bg-muted/40",
          pendingPayoutCount > 0 && "border-emerald-500/35 bg-emerald-500/8",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Finanzas y Payouts</p>
            <p className="mt-3 text-4xl font-black tabular-nums text-foreground">
              {pendingPayoutCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Liquidaciones por liberar o retenidas
            </p>
          </div>
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
            <Banknote className="size-5" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </div>
  )
}
