"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useState } from "react"
import { usePathname } from "next/navigation"

import { AdminNavTree } from "@/components/shared/admin-nav-tree"
import { BrandLogo } from "@/components/shared/brand-logo"
import { PwaInstallNavButton } from "@/components/pwa/pwa-install-nav-button"
import { SignOutButton } from "@/components/shared/sign-out-button"
import {
  SUPERADMIN_NAV_GROUPS,
  isSuperAdminNavActive,
} from "@/components/shared/superadmin-nav"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials } from "@/lib/format"
import { cn } from "@/lib/utils"

export type SuperAdminSidebarUser = {
  name: string
  email: string
}

export function SuperAdminSidebar({ user }: { user: SuperAdminSidebarUser }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const initials = getInitials(user.name, user.email)

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen flex-shrink-0 flex-col justify-between overflow-hidden border-r border-zinc-200 bg-white scrollbar-thin dark:border-zinc-800 dark:bg-zinc-950 md:flex",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        {collapsed ? (
          <BrandLogo markOnly href="/superadmin" className="justify-center" />
        ) : (
          <BrandLogo
            href="/superadmin"
            tagline="Dueño de la Plataforma"
            className="px-0.5"
          />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="grid size-9 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          aria-label={collapsed ? "Expandir menú" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        <AdminNavTree
          groups={SUPERADMIN_NAV_GROUPS}
          pathname={pathname}
          collapsed={collapsed}
          accent="sky"
          isActive={isSuperAdminNavActive}
          ariaLabel="Menú del panel"
        />
      </div>

      <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">
        {collapsed ? (
          <PwaInstallNavButton variant="icon" className="mx-auto mb-2" />
        ) : (
          <PwaInstallNavButton variant="sidebar" className="mb-2 px-1" />
        )}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border border-zinc-200 px-2 py-2 dark:border-zinc-800",
            collapsed && "justify-center border-transparent px-0",
          )}
        >
          <Avatar size="sm">
            <AvatarFallback className="bg-sky-500/15 text-[10px] text-sky-700 dark:text-sky-300">
              {initials || "SA"}
            </AvatarFallback>
          </Avatar>
          <span className={cn("min-w-0", collapsed && "sr-only")}>
            <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.name}
            </span>
            <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
              {user.email}
            </span>
          </span>
        </div>
        <SignOutButton
          showLabel={!collapsed}
          label="Cerrar Sesión"
          className={cn(
            "mt-2 w-full rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
            collapsed ? "h-10 justify-center px-0" : "h-10 justify-start px-2.5",
          )}
        />
      </div>
    </aside>
  )
}
