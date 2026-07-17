import { CalendarDays } from "lucide-react"

import { AdminSectionPlaceholder } from "@/components/shared/admin-section-placeholder"

export default function AdminEventsPage() {
  return (
    <AdminSectionPlaceholder
      title="Mis eventos"
      description="Crea, publica y administra toda tu cartelera."
      icon={CalendarDays}
    />
  )
}
