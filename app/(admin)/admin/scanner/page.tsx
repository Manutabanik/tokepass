import { ScanLine } from "lucide-react"

import { AdminSectionPlaceholder } from "@/components/shared/admin-section-placeholder"

export default function AdminScannerPage() {
  return (
    <AdminSectionPlaceholder
      title="Escáner de entradas"
      description="Valida accesos en tiempo real y evita entradas duplicadas."
      icon={ScanLine}
    />
  )
}
