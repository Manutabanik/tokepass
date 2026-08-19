"use client"

import {
  CalendarDays,
  Home,
  Menu,
  QrCode,
  ShoppingBag,
  Store,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"

import { PwaInstallNavButton } from "@/components/pwa/pwa-install-nav-button"
import { getAdminNavItems } from "@/components/shared/admin-nav"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { isAdminFocusedFlow } from "@/lib/navigation/focused-flows"
import { cn } from "@/lib/utils"
import type { EventStaffRole } from "@/types/auth"

type TabDef = {
  id: string
  label: string
  href?: string
  icon: typeof Home
  match?: (pathname: string) => boolean
  openMenu?: boolean
}

function buildTabs(mode: "organizer" | "staff", staffRoles: EventStaffRole[]): TabDef[] {
  if (mode === "staff") {
    const items = getAdminNavItems({ mode, staffRoles })
    const tabs: TabDef[] = []
    const scanner = items.find((item) => item.href === "/admin/scanner")
    const store = items.find((item) => item.href === "/admin/store-scanner")
    const pos = items.find((item) => item.href === "/dashboard/pos")
    if (scanner) {
      tabs.push({
        id: "scan",
        label: "Escáner",
        href: scanner.href,
        icon: QrCode,
        match: (path) => path.startsWith("/admin/scanner"),
      })
    }
    if (store) {
      tabs.push({
        id: "store",
        label: "Tienda",
        href: store.href,
        icon: ShoppingBag,
        match: (path) => path.startsWith("/admin/store-scanner"),
      })
    }
    if (pos) {
      tabs.push({
        id: "pos",
        label: "Cobrar",
        href: pos.href,
        icon: Store,
        match: (path) =>
          path.startsWith("/admin/pos") || path.startsWith("/dashboard/pos"),
      })
    }
    tabs.push({
      id: "menu",
      label: "Menú",
      icon: Menu,
      openMenu: true,
    })
    return tabs.slice(0, 4)
  }

  return [
    {
      id: "home",
      label: "Panel",
      href: "/admin",
      icon: Home,
      match: (path) => path === "/admin",
    },
    {
      id: "events",
      label: "Eventos",
      href: "/admin/events",
      icon: CalendarDays,
      match: (path) => path.startsWith("/admin/events"),
    },
    {
      id: "scan",
      label: "Escáner",
      href: "/admin/scanner",
      icon: QrCode,
      match: (path) => path.startsWith("/admin/scanner"),
    },
    {
      id: "menu",
      label: "Menú",
      icon: Menu,
      openMenu: true,
    },
  ]
}

export function AdminBottomNav({
  mode,
  staffRoles = [],
  orgLabel,
  userLabel,
  userEmail,
}: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
  orgLabel: string
  userLabel: string
  userEmail: string
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const tabs = useMemo(
    () => buildTabs(mode, staffRoles),
    [mode, staffRoles],
  )
  const navigation = getAdminNavItems({ mode, staffRoles })

  if (isAdminFocusedFlow(pathname)) {
    return null
  }

  return (
    <>
      <nav
        aria-label="Navegación rápida"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl",
          "pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1",
          "lg:hidden",
        )}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4 gap-0.5 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = tab.openMenu
              ? menuOpen
              : tab.match
                ? tab.match(pathname)
                : false
            const className = cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition",
              active
                ? "text-violet-600 dark:text-violet-300"
                : "text-muted-foreground hover:text-foreground",
            )

            if (tab.openMenu) {
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className={cn(className, "w-full")}
                    aria-label="Abrir menú"
                  >
                    <Icon className="size-6" strokeWidth={2.25} aria-hidden />
                    {tab.label}
                  </button>
                </li>
              )
            }

            return (
              <li key={tab.id}>
                <Link href={tab.href!} className={className}>
                  <Icon className="size-6" strokeWidth={2.25} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="p-0 lg:hidden">
          <SheetHeader>
            <BrandLogo inverted />
            <SheetTitle className="sr-only">Menú del panel</SheetTitle>
            <SheetDescription>
              {mode === "organizer" ? "Tu Panel" : "Acceso staff"}
            </SheetDescription>
            <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Organización
              </p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {orgLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </SheetHeader>

          <nav
            className="flex-1 space-y-1 overflow-y-auto p-3"
            aria-label="Más opciones"
          >
            {navigation.map(({ label, href, icon: Icon }) => {
              const active =
                href === "/admin"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                    active
                      ? "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/15"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              )
            })}
            <PwaInstallNavButton
              variant="sidebar"
              onAction={() => setMenuOpen(false)}
            />
          </nav>

          <SheetFooter className="gap-3">
            <div className="text-left">
              <p className="truncate text-sm font-medium text-foreground">
                {userLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </div>
            <SignOutButton className="min-h-12 h-12 w-full justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground" />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Altura aproximada de la bottom bar (para paddings sticky). */
export const ADMIN_BOTTOM_NAV_SPACE =
  "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
