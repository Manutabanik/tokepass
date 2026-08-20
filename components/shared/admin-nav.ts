import {
  CalendarDays,
  CircleHelp,
  ClipboardList,
  Home,
  Landmark,
  PieChart,
  Presentation,
  QrCode,
  ShoppingBag,
  Settings,
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
  { label: "Resumen de Ventas", href: "/admin", icon: Home },
  { label: "Mis Eventos", href: "/admin/events", icon: CalendarDays },
  { label: "Boletería POS", href: "/dashboard/pos", icon: Store },
  {
    label: "Recaudación y Retiros",
    href: "/admin/finances",
    icon: PieChart,
  },
  {
    label: "Datos de cobro",
    href: "/dashboard/settings/bank",
    icon: Landmark,
  },
  { label: "Listas y FreePass", href: "/admin/lists", icon: ClipboardList },
  { label: "Equipo y Staff", href: "/admin/team", icon: Users },
  {
    label: "Usuarios y PIN de caja",
    href: "/admin/settings/users",
    icon: Settings,
  },
  { label: "Promotores y RRPP", href: "/admin/promoters", icon: Users },
  { label: "Control de Puerta (Escáner)", href: "/admin/scanner", icon: QrCode },
  { label: "Escáner de Tienda", href: "/admin/store-scanner", icon: ShoppingBag },
  { label: "Mi Perfil", href: "/admin/profile", icon: UserRound },
  {
    label: "Preguntas frecuentes",
    href: "/admin/support-faqs",
    icon: CircleHelp,
  },
  {
    label: "Canvas comercial",
    href: "/admin/canvas-comercial",
    icon: Presentation,
  },
]

const STAFF_NAV_META: AdminNavItem[] = [
  { label: "Control de Puerta (Escáner)", href: "/admin/scanner", icon: QrCode },
  { label: "Validador de acceso", href: "/admin/validator", icon: QrCode },
  { label: "Escáner de Tienda", href: "/admin/store-scanner", icon: ShoppingBag },
  { label: "Boletería POS", href: "/dashboard/pos", icon: Store },
]

export function getAdminNavItems(input: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
}): AdminNavItem[] {
  if (input.mode === "organizer") return ORGANIZER_NAV
  const allowed = new Set(navAllowedForStaffRoles(input.staffRoles ?? []))
  return STAFF_NAV_META.filter((item) => allowed.has(item.href))
}
