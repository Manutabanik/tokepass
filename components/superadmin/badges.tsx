import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  EventStatus,
  OrderStatus,
  OrganizerApprovalStatus,
  UserRole,
} from "@/types/database"

const roleStyles: Record<UserRole, { label: string; className: string }> = {
  customer: {
    label: "Cliente",
    className:
      "border-border bg-muted text-muted-foreground",
  },
  admin: {
    label: "Organizador",
    className:
      "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  super_admin: {
    label: "Dueño de la plataforma",
    className:
      "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
}

const eventStatusStyles: Record<
  EventStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Borrador",
    className:
      "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  published: {
    label: "Publicado",
    className:
      "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  paused: {
    label: "Pausado",
    className:
      "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  },
  cancelled: {
    label: "Cancelado",
    className:
      "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  completed: {
    label: "Finalizado",
    className: "border-border bg-muted text-muted-foreground",
  },
  archived: {
    label: "Archivado",
    className: "border-border bg-muted text-muted-foreground",
  },
}

const orderStatusStyles: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className:
      "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  paid: {
    label: "Pagada",
    className:
      "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    label: "Fallida",
    className:
      "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  expired: {
    label: "Expirada",
    className: "border-border bg-muted text-muted-foreground",
  },
  refunded: {
    label: "Reembolsada",
    className:
      "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
}

const organizerStatusStyles: Record<
  OrganizerApprovalStatus,
  { label: string; className: string }
> = {
  none: {
    label: "Sin solicitud",
    className: "border-border bg-muted text-muted-foreground",
  },
  pending: {
    label: "Pendiente",
    className:
      "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  approved: {
    label: "Aprobada",
    className:
      "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  rejected: {
    label: "Rechazada",
    className:
      "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  suspended: {
    label: "Suspendida",
    className:
      "border-rose-500/40 bg-rose-500/15 text-rose-700 shadow-[0_0_16px_rgba(239,68,68,0.12)] dark:text-rose-200",
  },
}

export function RoleBadge({ role }: { role: UserRole }) {
  const style = roleStyles[role]
  return (
    <Badge variant="outline" className={cn(style.className)}>
      {style.label}
    </Badge>
  )
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const style = eventStatusStyles[status]
  return (
    <Badge variant="outline" className={cn(style.className)}>
      {style.label}
    </Badge>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const style = orderStatusStyles[status]
  return (
    <Badge variant="outline" className={cn(style.className)}>
      {style.label}
    </Badge>
  )
}

export function OrganizerStatusBadge({
  status,
}: {
  status: OrganizerApprovalStatus
}) {
  const style = organizerStatusStyles[status]
  return (
    <Badge variant="outline" className={cn(style.className)}>
      {style.label}
    </Badge>
  )
}
