import {
  CalendarDays,
  ClipboardList,
  Home,
  Landmark,
  PieChart,
  QrCode,
  Settings,
  ShoppingBag,
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

export type AdminNavGroup = {
  id: string
  label: string
  items: AdminNavItem[]
}

export const ORGANIZER_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    items: [
      { label: "Resumen de Ventas", href: "/admin", icon: Home },
      { label: "Mis Eventos", href: "/admin/events", icon: CalendarDays },
    ],
  },
  {
    id: "ventas",
    label: "Ventas y difusión",
    items: [
      { label: "Boletería POS", href: "/dashboard/pos", icon: Store },
      { label: "Promotores y RRPP", href: "/admin/promoters", icon: Users },
      { label: "Listas y FreePass", href: "/admin/lists", icon: ClipboardList },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    items: [
      {
        label: "Recaudación y Retiros",
        href: "/admin/finances",
        icon: PieChart,
      },
      {
        label: "Datos de Cobro",
        href: "/dashboard/settings/bank",
        icon: Landmark,
      },
    ],
  },
  {
    id: "control",
    label: "Control y equipo",
    items: [
      {
        label: "Control de Puerta / Escáner",
        href: "/admin/scanner",
        icon: QrCode,
      },
      {
        label: "Escáner de Tienda",
        href: "/admin/store-scanner",
        icon: ShoppingBag,
      },
      { label: "Equipo y Staff", href: "/admin/team", icon: Users },
      {
        label: "Usuarios y PIN de Caja",
        href: "/admin/settings/users",
        icon: Settings,
      },
    ],
  },
  {
    id: "configuracion",
    label: "Configuración",
    items: [{ label: "Mi Perfil", href: "/admin/profile", icon: UserRound }],
  },
]

const STAFF_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "ventas",
    label: "Ventas y difusión",
    items: [{ label: "Boletería POS", href: "/dashboard/pos", icon: Store }],
  },
  {
    id: "control",
    label: "Control y equipo",
    items: [
      {
        label: "Control de Puerta / Escáner",
        href: "/admin/scanner",
        icon: QrCode,
      },
      { label: "Validador de acceso", href: "/admin/validator", icon: QrCode },
      {
        label: "Escáner de Tienda",
        href: "/admin/store-scanner",
        icon: ShoppingBag,
      },
    ],
  },
]

export const ORGANIZER_NAV: AdminNavItem[] = ORGANIZER_NAV_GROUPS.flatMap(
  (group) => group.items,
)

export function isAdminNavActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getAdminNavGroups(input: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
}): AdminNavGroup[] {
  if (input.mode === "organizer") return ORGANIZER_NAV_GROUPS
  const allowed = new Set(navAllowedForStaffRoles(input.staffRoles ?? []))
  return STAFF_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.href)),
  })).filter((group) => group.items.length > 0)
}

export function getAdminNavItems(input: {
  mode: "organizer" | "staff"
  staffRoles?: EventStaffRole[]
}): AdminNavItem[] {
  return getAdminNavGroups(input).flatMap((group) => group.items)
}
