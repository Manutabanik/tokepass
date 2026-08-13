"use client"

import {
  Bell,
  Heart,
  Home,
  Receipt,
  Ticket,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NotificationDot } from "@/components/account/notification-dot"
import { useUserNotifications } from "@/hooks/use-user-notifications"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/cuenta", label: "Inicio", icon: Home, exact: true },
  { href: "/cuenta/entradas", label: "Entradas", icon: Ticket, exact: false },
  { href: "/cuenta/compras", label: "Compras", icon: Receipt, exact: false },
  { href: "/cuenta/favoritos", label: "Favoritos", icon: Heart, exact: false },
  {
    href: "/cuenta/notificaciones",
    label: "Avisos",
    icon: Bell,
    exact: false,
  },
  { href: "/cuenta/perfil", label: "Perfil", icon: UserRound, exact: false },
] as const

/** Tabs desktop del portal (el bottom nav cubre mobile). */
export function AccountDesktopNav() {
  const pathname = usePathname()
  const { unreadByTab, hasUnread } = useUserNotifications()

  function showDot(href: string) {
    if (href === "/cuenta/entradas") return unreadByTab.entradas
    if (href === "/cuenta/compras") return unreadByTab.compras
    if (href === "/cuenta/perfil") return unreadByTab.perfil
    if (href === "/cuenta/notificaciones") return hasUnread
    return false
  }

  return (
    <nav
      className="mb-6 hidden flex-wrap gap-2 md:flex"
      aria-label="Secciones de Mi cuenta"
    >
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
              active
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            <NotificationDot
              show={showDot(href)}
              className="right-1.5 top-1.5 size-2 ring-1 ring-[#09090b]"
            />
          </Link>
        )
      })}
    </nav>
  )
}
