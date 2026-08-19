"use client"

import { Bell, Heart, Home, Receipt, Ticket } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NotificationDot } from "@/components/account/notification-dot"
import { isAccountFocusedFlow } from "@/lib/navigation/focused-flows"
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
    match: (path: string) =>
      path.startsWith("/cuenta/entradas") || path.startsWith("/profile/tickets"),
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

  if (isAccountFocusedFlow(pathname)) {
    return null
  }

  function showDot(badge: (typeof TABS)[number]["badge"]) {
    if (badge === "entradas") return unreadByTab.entradas
    if (badge === "compras") return unreadByTab.compras
    if (badge === "all") return hasUnread
    return false
  }

  return (
    <nav
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 md:hidden",
        "bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
      )}
      aria-label="Portal de cuenta"
    >
      <ul className="pointer-events-auto flex w-full max-w-md items-center justify-around rounded-full border border-white/10 bg-black/80 px-4 py-3 shadow-2xl backdrop-blur-xl">
        {TABS.map(({ href, label, icon: Icon, match, badge }) => {
          const active = match(pathname)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-medium whitespace-nowrap transition",
                  active
                    ? "text-emerald-300"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  <NotificationDot
                    show={showDot(badge)}
                    className="-right-1 -top-0.5 size-2 ring-1 ring-black"
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
