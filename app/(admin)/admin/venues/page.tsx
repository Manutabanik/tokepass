import { Ticket } from "lucide-react"

import { AdminSectionPlaceholder } from "@/components/shared/admin-section-placeholder"

export default function AdminVenuesPage() {
  return (
    <AdminSectionPlaceholder
      title="Taquilla / Venues"
      description="Administra recintos, zonas, aforos y mapas de asientos."
      icon={Ticket}
    />
  )
}
