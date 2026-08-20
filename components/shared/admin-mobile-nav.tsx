"use client"

import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { getAdminNavGroups } from "@/components/shared/admin-nav"
import { AdminNavTree } from "@/components/shared/admin-nav-tree"
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
  const groups = getAdminNavGroups({ mode, staffRoles })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden size-11 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Organización activa
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
            onNavigate={() => setOpen(false)}
          />
        </div>

        <SheetFooter className="gap-3">
          <div className="text-left">
            <p className="truncate text-sm font-medium text-foreground">{userLabel}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <SignOutButton
            label="Cerrar Sesión"
            className="h-11 w-full justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
