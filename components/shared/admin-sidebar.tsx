"use client"

import {
  CalendarDays,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  QrCode,
  Ticket,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const navigation = [
  { label: "Dashboard", href: "/admin", icon: Home },
  { label: "Mis eventos", href: "/admin/events", icon: CalendarDays },
  { label: "Taquilla / Venues", href: "/admin/venues", icon: Ticket },
  { label: "Finanzas & Split", href: "/admin/finances", icon: PieChart },
  { label: "Equipo & RRPP", href: "/admin/team", icon: Users },
  { label: "Escáner Web", href: "/admin/scanner", icon: QrCode },
] as const

export function AdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 border-r border-white/8 bg-[#09090b] p-4 text-zinc-300 transition-[width] duration-300 lg:sticky lg:top-0 lg:flex lg:flex-col",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div className="flex h-10 items-center justify-between">
        {collapsed ? (
          <Link
            href="/admin"
            className="grid size-10 place-items-center rounded-xl bg-violet-600 font-black text-white"
            aria-label="Tokepass Command Center"
          >
            T
          </Link>
        ) : (
          <BrandLogo inverted className="px-1" />
        )}

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <div className={cn("mt-8 px-2", collapsed && "sr-only")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          Command Center
        </p>
      </div>

      <nav className="mt-3 space-y-1" aria-label="Navegación administrativa">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/admin"
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                active
                  ? "bg-violet-500/12 text-violet-300 ring-1 ring-inset ring-violet-500/15"
                  : "text-zinc-500 hover:bg-white/5 hover:text-white",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && "sr-only")}>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto">
        <Separator className="mb-4 bg-white/8" />
        <div className={cn("px-2", collapsed && "text-center")}>
          <p className="text-xs font-medium text-zinc-600">
            {collapsed ? "TP" : "Tokepass · Organizer OS"}
          </p>
        </div>
      </div>
    </aside>
  )
}
