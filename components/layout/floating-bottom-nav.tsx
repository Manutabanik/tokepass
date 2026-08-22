"use client"

import { Compass, Heart, Ticket, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { useScrollDirection } from "@/hooks/use-scroll-direction"
import {
  isPublicEventStorefrontPath,
  isPublicFocusedFlow,
} from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

const ITEMS = [
  {
    href: "/",
    label: "Descubrir shows",
    icon: Compass,
    match: (path: string) => path === "/",
  },
  {
    href: "/cuenta/entradas",
    label: "Mis entradas",
    icon: Ticket,
    match: (path: string) =>
      path.startsWith("/cuenta/entradas") ||
      path.startsWith("/mis-entradas") ||
      path.startsWith("/profile/tickets") ||
      path.startsWith("/my-tickets"),
  },
  {
    href: "/cuenta/favoritos",
    label: "Favoritos",
    icon: Heart,
    match: (path: string) => path.startsWith("/cuenta/favoritos"),
  },
  {
    href: "/cuenta",
    label: "Perfil",
    icon: User,
    match: (path: string) =>
      path === "/cuenta" ||
      path === "/cuenta/perfil" ||
      path.startsWith("/cuenta/perfil") ||
      path === "/perfil" ||
      path === "/profile",
  },
] as const

function subscribe() {
  return () => {}
}

function useHasDocument() {
  return useSyncExternalStore(
    subscribe,
    () => typeof document !== "undefined",
    () => false,
  )
}

export function FloatingBottomNav() {
  const pathname = usePathname()
  const scrollDirection = useScrollDirection()
  const hasDocument = useHasDocument()

  if (!hasDocument) return null
  if (isPublicFocusedFlow(pathname)) return null
  if (isPublicEventStorefrontPath(pathname)) return null

  // Visible by default; only hide after a downward scroll gesture.
  const collapsed = scrollDirection === "down"

  return createPortal(
    <nav
      aria-label="Cartelera de eventos"
      className={cn(
        "pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[92%] max-w-md lg:hidden",
        "items-center justify-between rounded-full border border-white/15 bg-black/80 p-2 shadow-2xl backdrop-blur-xl",
        "transition-transform duration-300 ease-in-out will-change-transform",
        collapsed
          ? "-translate-x-1/2 translate-y-[150%]"
          : "-translate-x-1/2 translate-y-0",
      )}
    >
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-2 text-[10px] font-semibold tracking-wide transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-gray-200",
            )}
          >
            <Icon
              className="size-5"
              strokeWidth={active ? 2.35 : 2}
              aria-hidden="true"
            />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>,
    document.body,
  )
}
