import {
  CalendarDays,
  ClipboardList,
  GlassWater,
  Home,
  PieChart,
  QrCode,
  Store,
  Ticket,
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
  { label: "Dashboard", href: "/admin", icon: Home },
  { label: "Mis eventos", href: "/admin/events", icon: CalendarDays },
  { label: "Recintos", href: "/admin/venues", icon: Ticket },
  { label: "POS Puerta", href: "/admin/pos", icon: Store },
  { label: "Finanzas", href: "/admin/finances", icon: PieChart },
  { label: "Listas / FreePass", href: "/admin/lists", icon: ClipboardList },
  { label: "Equipo & Staff", href: "/admin/team", icon: Users },
  { label: "RRPP", href: "/admin/promoters", icon: Users },
  { label: "Escáner Web", href: "/admin/scanner", icon: QrCode },
  { label: "Escáner Barra", href: "/admin/bar-scanner", icon: GlassWater },
]

const STAFF_NAV_META: AdminNavItem[] = [
  { label: "Escáner Web", href: "/admin/scanner", icon: QrCode },
  { label: "Escáner Barra", href: "/admin/bar-scanner", icon: GlassWater },
  { label: "POS Puerta", href: "/admin/pos", icon: Store },
]

export function getAdminNavItems(input: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
}): AdminNavItem[] {
  if (input.mode === "organizer") return ORGANIZER_NAV
  const allowed = new Set(navAllowedForStaffRoles(input.staffRoles ?? []))
  return STAFF_NAV_META.filter((item) => allowed.has(item.href))
}
