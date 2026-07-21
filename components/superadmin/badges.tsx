import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { EventStatus, OrderStatus, UserRole } from "@/types/database"

const roleStyles: Record<UserRole, { label: string; className: string }> = {
  customer: {
    label: "Cliente",
    className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-300",
  },
  admin: {
    label: "Organizador",
    className: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  },
  super_admin: {
    label: "Super admin",
    className: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  },
}

const eventStatusStyles: Record<
  EventStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Borrador",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  published: {
    label: "Publicado",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  cancelled: {
    label: "Cancelado",
    className: "border-red-400/20 bg-red-400/10 text-red-300",
  },
  completed: {
    label: "Finalizado",
    className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  },
}

const orderStatusStyles: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  paid: {
    label: "Pagada",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  failed: {
    label: "Fallida",
    className: "border-red-400/20 bg-red-400/10 text-red-300",
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
