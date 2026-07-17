import { Users } from "lucide-react"

import { AdminSectionPlaceholder } from "@/components/shared/admin-section-placeholder"

export default function AdminTeamPage() {
  return (
    <AdminSectionPlaceholder
      title="Equipo & RRPP"
      description="Gestiona colaboradores, permisos, enlaces y comisiones."
      icon={Users}
    />
  )
}
