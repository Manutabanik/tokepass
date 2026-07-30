"use client"

import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { cn } from "@/lib/utils"

const navigation = [
  { label: "Overview", href: "/superadmin", icon: LayoutDashboard },
  {
    label: "Organizaciones",
    href: "/superadmin/organizations",
    icon: Building2,
  },
  { label: "Usuarios", href: "/superadmin/users", icon: Users },
  { label: "Eventos", href: "/superadmin/events", icon: CalendarDays },
  { label: "Órdenes", href: "/superadmin/orders", icon: Receipt },
  { label: "Liquidaciones", href: "/superadmin/settlements", icon: Wallet },
  { label: "Ajustes", href: "/superadmin/settings", icon: Settings },
] as const

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 border-r border-white/8 bg-[#08080b] p-4 text-zinc-300 transition-[width] duration-300 lg:sticky lg:top-0 lg:flex lg:flex-col",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div className="flex h-10 items-center justify-between">
        <Link
          href="/superadmin"
          className={cn(
            "flex items-center gap-2.5 font-black tracking-tight text-white",
            collapsed && "justify-center",
          )}
          aria-label="Tokepass Platform OS"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-indigo-950/40">
            <ShieldCheck className="size-4" />
          </span>
          {!collapsed && (
            <span className="leading-tight">
              Tokepass
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">
                Platform OS
              </span>
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className={cn(
            "grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-white",
            collapsed && "hidden",
          )}
          aria-label="Colapsar sidebar"
          title="Colapsar"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mt-3 grid h-9 w-full place-items-center rounded-lg text-zinc-500 transition hover:bg-white/5 hover:text-white"
          aria-label="Expandir sidebar"
          title="Expandir"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <div className={cn("mt-8 px-2", collapsed && "sr-only")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          Control de plataforma
        </p>
      </div>

      <nav className="mt-3 space-y-1" aria-label="Navegación de plataforma">
        {navigation.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/superadmin"
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
                  ? "bg-sky-500/12 text-sky-300 ring-1 ring-inset ring-sky-500/15"
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
        <Link
          href="/admin"
          title={collapsed ? "Panel organizador" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-zinc-500 transition hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <LayoutDashboard className="size-[18px] shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>
            Ir al panel organizador
          </span>
        </Link>
      </div>
    </aside>
  )
}
