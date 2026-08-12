"use client"

import { Menu } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { getAdminNavItems } from "@/components/shared/admin-nav"
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
import type { EventStaffRole } from "@/types/auth"

export function AdminMobileNav({
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
  const [open, setOpen] = useState(false)
  const navigation = getAdminNavItems({ mode, staffRoles })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden text-zinc-300 hover:bg-white/5 hover:text-white"
            aria-label="Abrir menú"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetHeader>
          <BrandLogo inverted />
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SheetDescription>
            {mode === "organizer" ? "Tu Panel" : "Acceso staff"}
          </SheetDescription>
          <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Organización activa
            </p>
            <p className="mt-1 truncate text-sm font-medium text-white">
              {orgLabel}
            </p>
            <p className="truncate text-xs text-zinc-500">{userEmail}</p>
          </div>
        </SheetHeader>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menú móvil">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/admin"
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  active
                    ? "bg-violet-500/12 text-violet-300 ring-1 ring-inset ring-violet-500/15"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
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
          <SignOutButton className="h-11 w-full justify-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-white" />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
