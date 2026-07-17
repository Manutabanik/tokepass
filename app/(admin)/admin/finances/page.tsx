import { BarChart3 } from "lucide-react"

import { AdminSectionPlaceholder } from "@/components/shared/admin-section-placeholder"

export default function AdminFinancesPage() {
  return (
    <AdminSectionPlaceholder
      title="Finanzas"
      description="Monitorea ingresos, liquidaciones y desempeño por evento."
      icon={BarChart3}
    />
  )
}
