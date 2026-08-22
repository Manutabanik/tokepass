"use client"

import {
  Bell,
  CheckCheck,
  Gift,
  Receipt,
  UserRound,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BuyerNotificationKind } from "@/app/actions/buyer-notifications"

function iconFor(kind: BuyerNotificationKind) {
  switch (kind) {
    case "transfer":
      return Gift
    case "order":
      return Receipt
    case "profile_dni":
      return UserRound
    default:
      return Bell
  }
}

export function AccountNotificationsPanel() {
  const {
    notifications,
    unread,
    loading,
    markRead,
    markAllRead,
  } = useUserNotifications()

  return (
    <section className="space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300/90">
            Novedades
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Notificaciones
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Regalos, compras y avisos de tu cuenta.
          </p>
        </div>
        {unread.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-12 rounded-xl border-border"
            onClick={markAllRead}
          >
            <CheckCheck className="size-4" />
            Marcar todo como leído
          </Button>
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando novedades…</p>
      ) : notifications.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
          <Bell className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-bold text-foreground">
            No hay notificaciones
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cuando te regalen una entrada o completes una compra, aparece acá.
          </p>
          <Button
            className="mt-6 min-h-12 rounded-xl bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => {
            const Icon = iconFor(item.kind)
            const isUnread = unread.some((row) => row.id === item.id)
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => markRead(item.id)}
                  className={cn(
                    "flex min-h-16 gap-3 rounded-2xl border p-4 transition",
                    isUnread
                      ? "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15"
                      : "border-border bg-card hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
                      isUnread
                        ? "bg-rose-500/20 text-rose-800 ring-rose-400/30 dark:text-rose-200"
                        : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{item.title}</p>
                      {isUnread ? (
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-rose-500" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground/80">
                      {formatEventDay(item.createdAt)} ·{" "}
                      {formatEventTime(item.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
