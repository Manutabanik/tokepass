import type { Metadata } from "next"

import { DoorScanner } from "@/components/admin/door-scanner"

export const metadata: Metadata = {
  title: "Control de Puerta",
  description: "Setup de turno y escáner táctico TokePass.",
}

export default function AdminScannerPage() {
  return <DoorScanner />
}
