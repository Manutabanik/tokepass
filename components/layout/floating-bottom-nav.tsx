"use client"

import { Compass, Heart, Ticket, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { isPublicFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"

const ITEMS = [
  {
    href: "/",
    label: "Explorar",
    icon: Compass,
    match: (path: string) => path === "/",
  },
  {
    href: "/cuenta/entradas",
    label: "Entradas",
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

export function FloatingBottomNav() {
  const pathname = usePathname()
  const scrollDirection = useScrollDirection()

  if (isPublicFocusedFlow(pathname)) {
    return null
  }

  const hidden = scrollDirection === "down"

  return (
    <nav
      aria-label="Navegacion principal"
      className={cn(
        "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 md:hidden",
        "flex items-center gap-1 rounded-full border border-white/10 bg-black/80 p-1.5 shadow-2xl backdrop-blur-md",
        "transition-transform duration-300 ease-in-out",
        "pb-[max(0.375rem,env(safe-area-inset-bottom))]",
        hidden ? "translate-y-[150%]" : "translate-y-0",
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
              "flex min-w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-[10px] font-semibold tracking-wide transition-colors",
              active ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200",
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
    </nav>
  )
}
