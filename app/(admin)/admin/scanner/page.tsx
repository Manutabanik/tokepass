import type { Metadata } from "next"

import { DoorScanner } from "@/components/admin/door-scanner"

export const metadata: Metadata = {
  title: "Control de Puerta (Escáner)",
  description:
    "Escaneá los códigos QR desde tu celular o buscá al comprador por nombre si se quedó sin batería.",
}

export default function AdminScannerPage() {
  return <DoorScanner />
}
