import type { Metadata } from "next"

import { DoorScannerClient } from "@/components/admin/door-scanner-entry"

export const metadata: Metadata = {
  title: "Control de Puerta",
  description: "Setup de turno y escáner táctico TokePass.",
}

export default function AdminScannerPage() {
  return <DoorScannerClient />
}
