"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { SUPERADMIN_NAV } from "@/components/shared/superadmin-mobile-nav"
import { cn } from "@/lib/utils"

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 border-r border-white/8 bg-[#08080b] p-4 text-zinc-300 transition-[width] duration-300 md:sticky md:top-0 md:flex md:flex-col",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          collapsed ? "h-10" : "min-h-12",
        )}
      >
        {collapsed ? (
          <BrandLogo
            inverted
            markOnly
            href="/superadmin"
            className="justify-center"
          />
        ) : (
          <BrandLogo
            inverted
            href="/superadmin"
            tagline="Dueño de la Plataforma"
            className="px-0.5"
          />
        )}

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
          Menú principal
        </p>
      </div>

      <nav className="mt-3 space-y-1" aria-label="Menú del panel">
        {SUPERADMIN_NAV.map(({ label, href, icon: Icon }) => {
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

      <div className="mt-auto px-2 pt-4">
        <p
          className={cn(
            "text-[11px] text-zinc-600",
            collapsed && "sr-only",
          )}
        >
          Panel de Control Central
        </p>
      </div>
    </aside>
  )
}
