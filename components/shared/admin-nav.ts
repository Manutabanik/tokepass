import {
  CalendarDays,
  ClipboardList,
  GlassWater,
  Home,
  PieChart,
  QrCode,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { EventStaffRole } from "@/types/auth"
import { navAllowedForStaffRoles } from "@/types/auth"

export type AdminNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export const ORGANIZER_NAV: AdminNavItem[] = [
  { label: "Inicio", href: "/admin", icon: Home },
  { label: "Mis eventos", href: "/admin/events", icon: CalendarDays },
  { label: "Cobrar en puerta", href: "/admin/pos", icon: Store },
  { label: "Ventas y dinero", href: "/admin/finances", icon: PieChart },
  { label: "Listas y FreePass", href: "/admin/lists", icon: ClipboardList },
  { label: "Equipo y staff", href: "/admin/team", icon: Users },
  { label: "Promotores y RRPP", href: "/admin/promoters", icon: Users },
  { label: "Escáner web", href: "/admin/scanner", icon: QrCode },
  { label: "Escáner de barra", href: "/admin/bar-scanner", icon: GlassWater },
  { label: "Mi perfil", href: "/admin/profile", icon: UserRound },
]

const STAFF_NAV_META: AdminNavItem[] = [
  { label: "Escáner web", href: "/admin/scanner", icon: QrCode },
  { label: "Escáner de barra", href: "/admin/bar-scanner", icon: GlassWater },
  { label: "Cobrar en puerta", href: "/admin/pos", icon: Store },
]

export function getAdminNavItems(input: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
}): AdminNavItem[] {
  if (input.mode === "organizer") return ORGANIZER_NAV
  const allowed = new Set(navAllowedForStaffRoles(input.staffRoles ?? []))
  return STAFF_NAV_META.filter((item) => allowed.has(item.href))
}
