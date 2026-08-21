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

import { getAdminNavGroups, getAdminNavItems } from "@/components/shared/admin-nav"
import { AdminNavTree } from "@/components/shared/admin-nav-tree"
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
  if (isAdminFocusedFlow(pathname)) {
    return null
  }

  return (
    <AdminBottomNavChrome
      mode={mode}
      staffRoles={staffRoles}
      orgLabel={orgLabel}
      userLabel={userLabel}
      userEmail={userEmail}
    />
  )
}

function AdminBottomNavChrome({
  mode,
  staffRoles,
  orgLabel,
  userLabel,
  userEmail,
}: {
  mode: "organizer" | "staff"
  staffRoles: EventStaffRole[]
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
  const groups = getAdminNavGroups({ mode, staffRoles })

  return (
    <>
      <nav
        aria-label="Navegación rápida"
        className={cn(
          "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden",
          "bottom-[max(env(safe-area-inset-bottom),1rem)]",
        )}
      >
        <ul
          className={cn(
            "pointer-events-auto grid w-full max-w-md items-center gap-1 rounded-full border border-white/10 bg-black/80 px-4 py-3 shadow-2xl backdrop-blur-md",
            tabs.length <= 2 && "grid-cols-2",
            tabs.length === 3 && "grid-cols-3",
            tabs.length >= 4 && "grid-cols-4",
          )}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = tab.openMenu
              ? menuOpen
              : tab.match
                ? tab.match(pathname)
                : false
            const className = cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-semibold whitespace-nowrap transition",
              active ? "text-violet-300" : "text-zinc-400 hover:text-white",
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
                    <Icon className="size-5" strokeWidth={2.25} aria-hidden />
                    {tab.label}
                  </button>
                </li>
              )
            }

            return (
              <li key={tab.id}>
                <Link href={tab.href!} className={className}>
                  <Icon className="size-5" strokeWidth={2.25} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex h-dvh flex-col overflow-hidden p-0 lg:hidden">
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

          <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
            <AdminNavTree
              groups={groups}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>

          <SheetFooter className="gap-3">
            <div className="text-left">
              <p className="truncate text-sm font-medium text-foreground">
                {userLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </div>
            <SignOutButton
              label="Cerrar Sesión"
              className="min-h-12 h-12 w-full justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
