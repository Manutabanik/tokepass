"use client"

import { Bell, Heart, Home, Receipt, Ticket } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NotificationDot } from "@/components/account/notification-dot"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { cn } from "@/lib/utils"

const TABS = [
  {
    href: "/cuenta",
    label: "Inicio",
    icon: Home,
    match: (path: string) => path === "/cuenta",
    badge: null as null | "entradas" | "compras" | "all",
  },
  {
    href: "/cuenta/entradas",
    label: "Entradas",
    icon: Ticket,
    match: (path: string) => path.startsWith("/cuenta/entradas"),
    badge: "entradas" as const,
  },
  {
    href: "/cuenta/compras",
    label: "Compras",
    icon: Receipt,
    match: (path: string) => path.startsWith("/cuenta/compras"),
    badge: "compras" as const,
  },
  {
    href: "/cuenta/favoritos",
    label: "Favoritos",
    icon: Heart,
    match: (path: string) => path.startsWith("/cuenta/favoritos"),
    badge: null,
  },
  {
    href: "/cuenta/notificaciones",
    label: "Avisos",
    icon: Bell,
    match: (path: string) => path.startsWith("/cuenta/notificaciones"),
    badge: "all" as const,
  },
] as const

export function AccountBottomNav() {
  const pathname = usePathname()
  const { unreadByTab, hasUnread } = useUserNotifications()

  function showDot(badge: (typeof TABS)[number]["badge"]) {
    if (badge === "entradas") return unreadByTab.entradas
    if (badge === "compras") return unreadByTab.compras
    if (badge === "all") return hasUnread
    return false
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden"
      aria-label="Portal de cuenta"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {TABS.map(({ href, label, icon: Icon, match, badge }) => {
          const active = match(pathname)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition",
                  active
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  <NotificationDot
                    show={showDot(badge)}
                    className="-right-1 -top-0.5 size-2 ring-1 ring-background"
                  />
                </span>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
