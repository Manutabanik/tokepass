"use client"

import Link from "next/link"

import { NotificationDot } from "@/components/account/notification-dot"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { cn } from "@/lib/utils"

export function MobileAccountAvatarLink({
  initials,
  avatarUrl,
}: {
  initials: string
  avatarUrl?: string | null
}) {
  const { hasUnread } = useUserNotifications()

  return (
    <Link
      href="/cuenta/notificaciones"
      className={cn(
        "relative inline-flex size-11 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-sm font-bold text-zinc-800",
        "dark:border-white/10 dark:bg-white/5 dark:text-white",
        "md:hidden",
      )}
      aria-label={
        hasUnread
          ? "Notificaciones · tenés novedades sin leer"
          : "Notificaciones"
      }
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
      <NotificationDot show={hasUnread} />
    </Link>
  )
}
