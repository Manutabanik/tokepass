"use client"

import { Compass, Search, Ticket, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { isPublicFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn, tapFeedbackClass } from "@/lib/utils"

export const MOBILE_BOTTOM_NAV_OFFSET =
  "calc(4.25rem + env(safe-area-inset-bottom))"

const ITEMS = [
  {
    id: "home",
    href: "/",
    label: "Inicio",
    icon: Compass,
    match: (path: string) => path === "/",
  },
  {
    id: "search",
    href: "/buscar",
    label: "Buscar",
    icon: Search,
    match: (path: string) =>
      path === "/buscar" ||
      path.startsWith("/buscar/") ||
      path === "/eventos" ||
      path === "/events",
  },
  {
    id: "tickets",
    href: "/mis-entradas",
    label: "Mis Entradas",
    icon: Ticket,
    match: (path: string) =>
      path.startsWith("/mis-entradas") || path.startsWith("/cuenta/entradas"),
  },
  {
    id: "profile",
    href: "/perfil",
    label: "Perfil",
    icon: User,
    match: (path: string) =>
      path === "/perfil" ||
      path === "/cuenta" ||
      path === "/cuenta/perfil" ||
      path.startsWith("/cuenta/perfil"),
  },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  if (isPublicFocusedFlow(pathname)) {
    return null
  }

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-[80] border-t border-border/50 bg-background/95 px-2 py-2 shadow-2xl backdrop-blur-xl lg:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Navegacion de Tokepass"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.match(pathname)
          return (
            <li key={item.id} className="flex flex-1">
              <Link
                href={item.href}
                className={cn(
                  tapFeedbackClass,
                  "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium",
                  active
                    ? "font-bold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
