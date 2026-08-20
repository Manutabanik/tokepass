import {
  Banknote,
  Building2,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  Tags,
  Users,
} from "lucide-react"

import type { AdminNavGroup, AdminNavItem } from "@/components/shared/admin-nav"

export const SUPERADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "control",
    label: "Control general",
    items: [
      { label: "Resumen / Dashboard", href: "/superadmin", icon: LayoutDashboard },
      {
        label: "Solicitudes y Auditoría",
        href: "/superadmin/applications",
        icon: ClipboardList,
      },
      { label: "Eventos", href: "/superadmin/events", icon: CalendarDays },
      {
        label: "Eventos Pendientes",
        href: "/superadmin/auditoria",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "usuarios",
    label: "Usuarios y red",
    items: [
      { label: "Productoras", href: "/superadmin/organizers", icon: Building2 },
      { label: "Compradores", href: "/superadmin/buyers", icon: Users },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas y facturación",
    items: [
      {
        label: "Compras y Transacciones",
        href: "/superadmin/orders",
        icon: Receipt,
      },
      {
        label: "Finanzas y Payouts",
        href: "/superadmin/settlements",
        icon: Banknote,
      },
    ],
  },
  {
    id: "plataforma",
    label: "Plataforma y contenido",
    items: [
      {
        label: "Centro de Soporte",
        href: "/superadmin/soporte",
        icon: MessageSquare,
      },
      {
        label: "Preguntas Frecuentes FAQ",
        href: "/superadmin/faq",
        icon: CircleHelp,
      },
      {
        label: "Sponsors y Marcas",
        href: "/superadmin/settings/sponsors",
        icon: Handshake,
      },
      { label: "Categorías", href: "/superadmin/categories", icon: Tags },
      {
        label: "Ajustes del Sistema",
        href: "/superadmin/settings",
        icon: Settings,
      },
    ],
  },
]

export const SUPERADMIN_NAV: AdminNavItem[] = SUPERADMIN_NAV_GROUPS.flatMap(
  (group) => group.items,
)

const SUPERADMIN_HREFS = SUPERADMIN_NAV.map((item) => item.href)

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function isSuperAdminNavActive(pathname: string, href: string) {
  const current = normalizePath(pathname)

  if (href === "/superadmin" || href === "/super-admin") {
    return current === "/superadmin" || current === "/super-admin"
  }

  const matches = current === href || current.startsWith(`${href}/`)
  if (!matches) return false

  return !SUPERADMIN_HREFS.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (current === other || current.startsWith(`${other}/`)),
  )
}
