"use client"

import {
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  Tags,
  Users,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export const SUPERADMIN_NAV = [
  { label: "Resumen", href: "/superadmin", icon: LayoutDashboard },
  {
    label: "Solicitudes",
    href: "/superadmin/applications",
    icon: ClipboardList,
  },
  {
    label: "Productoras",
    href: "/superadmin/organizers",
    icon: Building2,
  },
  { label: "Compradores", href: "/superadmin/buyers", icon: Users },
  { label: "Eventos", href: "/superadmin/events", icon: CalendarDays },
  { label: "Categorías", href: "/superadmin/categories", icon: Tags },
  { label: "Compras", href: "/superadmin/orders", icon: Receipt },
  { label: "Liquidaciones", href: "/superadmin/settlements", icon: Wallet },
  { label: "Ajustes", href: "/superadmin/settings", icon: Settings },
] as const

export function SuperAdminMobileNav({
  userLabel,
  userEmail,
}: {
  userLabel: string
  userEmail: string
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-12 min-h-12 min-w-12 text-zinc-200 hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Abrir menú"
          />
        }
      >
        <Menu className="size-6" strokeWidth={2.25} />
      </SheetTrigger>
      <SheetContent side="left" className="p-0 md:hidden">
        <SheetHeader>
          <BrandLogo inverted href="/superadmin" />
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SheetDescription>Panel de control</SheetDescription>
          <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Dueño de la Plataforma
            </p>
            <p className="mt-1 truncate text-sm font-medium text-white">
              {userLabel}
            </p>
            <p className="truncate text-xs text-zinc-500">{userEmail}</p>
          </div>
        </SheetHeader>

        <nav
          className="flex-1 space-y-1 overflow-y-auto p-3"
          aria-label="Menú móvil"
        >
          {SUPERADMIN_NAV.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/superadmin"
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl px-3 py-4 text-base font-medium transition",
                  active
                    ? "bg-sky-500/12 text-sky-300 ring-1 ring-inset ring-sky-500/15"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-6 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </nav>

        <SheetFooter className="gap-3">
          <div className="text-left">
            <p className="truncate text-sm font-medium text-white">{userLabel}</p>
            <p className="truncate text-xs text-zinc-500">{userEmail}</p>
          </div>
          <SignOutButton className="min-h-12 h-12 w-full justify-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white" />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
