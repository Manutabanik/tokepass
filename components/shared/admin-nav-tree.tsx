"use client"

import { ChevronDown } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import {
  isAdminNavActive,
  type AdminNavGroup,
} from "@/components/shared/admin-nav"
import { cn } from "@/lib/utils"

export type AdminNavAccent = "violet" | "sky"

export function AdminNavTree({
  groups,
  pathname,
  collapsed = false,
  onNavigate,
  accent = "violet",
  isActive = isAdminNavActive,
  ariaLabel = "Menú del organizador",
}: {
  groups: AdminNavGroup[]
  pathname: string
  collapsed?: boolean
  onNavigate?: () => void
  accent?: AdminNavAccent
  isActive?: (pathname: string, href: string) => boolean
  ariaLabel?: string
}) {
  const [openIds, setOpenIds] = useState(() => new Set(groups.map((group) => group.id)))

  useEffect(() => {
    const activeGroup = groups.find((group) =>
      group.items.some((item) => isActive(pathname, item.href)),
    )
    if (!activeGroup) return
    setOpenIds((current) => {
      if (current.has(activeGroup.id)) return current
      const next = new Set(current)
      next.add(activeGroup.id)
      return next
    })
  }, [groups, isActive, pathname])

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (collapsed) {
    return (
      <nav className="space-y-1" aria-label={ariaLabel}>
        {groups.flatMap((group) =>
          group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed
              onNavigate={onNavigate}
              accent={accent}
              isActive={isActive}
            />
          )),
        )}
      </nav>
    )
  }

  return (
    <nav className="space-y-4" aria-label={ariaLabel}>
      {groups.map((group) => {
        const open = openIds.has(group.id)
        return (
          <section key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={open}
              className="flex h-8 w-full items-center justify-between rounded-md px-2 text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            >
              {group.label}
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <div className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={onNavigate}
                    accent={accent}
                    isActive={isActive}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </nav>
  )
}

function NavLink({
  item,
  pathname,
  collapsed = false,
  onNavigate,
  accent,
  isActive,
}: {
  item: AdminNavGroup["items"][number]
  pathname: string
  collapsed?: boolean
  onNavigate?: () => void
  accent: AdminNavAccent
  isActive: (pathname: string, href: string) => boolean
}) {
  const Icon = item.icon
  const active = isActive(pathname, item.href)
  const sky = accent === "sky"
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-10 items-center gap-3 px-2.5 text-sm transition-colors",
        sky ? "rounded-xl" : "rounded-lg",
        active
          ? sky
            ? "bg-sky-50 font-medium text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
            : "bg-violet-500/12 font-medium text-violet-700 ring-1 ring-inset ring-violet-500/20 dark:text-violet-300 dark:ring-violet-500/15"
          : "font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </Link>
  )
}
