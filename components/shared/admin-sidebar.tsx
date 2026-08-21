"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { getAdminNavGroups } from "@/components/shared/admin-nav"
import { AdminNavTree } from "@/components/shared/admin-nav-tree"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { EventStaffRole } from "@/types/auth"

export type AdminSidebarUser = {
  name: string
  email: string
  avatarUrl?: string | null
}

export function AdminSidebar({
  mode = "organizer",
  staffRoles = [],
  user,
}: {
  mode?: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
  user: AdminSidebarUser
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const groups = getAdminNavGroups({ mode, staffRoles })
  const homeHref =
    mode === "organizer" ? "/admin" : (groups[0]?.items[0]?.href ?? "/admin/scanner")
  const initials = user.name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-0 lg:flex",
        collapsed ? "w-20" : "w-64",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        {collapsed ? (
          <BrandLogo markOnly href={homeHref} className="justify-center" />
        ) : (
          <BrandLogo href={homeHref} className="px-0.5" />
        )}
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          aria-label={collapsed ? "Expandir menú" : "Cerrar menú"}
          title={collapsed ? "Expandir" : "Cerrar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
        <AdminNavTree groups={groups} pathname={pathname} collapsed={collapsed} />
      </div>

      <div className="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-800">
        {mode === "organizer" ? (
          <Link
            href="/admin/profile"
            title={collapsed ? user.name : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border border-zinc-200 px-2 py-2 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
              collapsed && "justify-center border-transparent px-0",
            )}
          >
            <Avatar size="sm">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.name} />
              ) : null}
              <AvatarFallback className="bg-violet-500/15 text-[10px] text-violet-700 dark:text-violet-300">
                {initials || "TP"}
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
          </Link>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-lg border border-zinc-200 px-2 py-2 dark:border-zinc-800",
              collapsed && "justify-center border-transparent px-0",
            )}
          >
            <Avatar size="sm">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.name} />
              ) : null}
              <AvatarFallback className="bg-violet-500/15 text-[10px] text-violet-700 dark:text-violet-300">
                {initials || "ST"}
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
        )}
        <SignOutButton
          showLabel={!collapsed}
          label="Cerrar Sesión"
          className={cn(
            "mt-2 w-full rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
            collapsed ? "h-10 justify-center px-0" : "h-10 justify-start px-2.5",
          )}
        />
      </div>
    </aside>
  )
}
