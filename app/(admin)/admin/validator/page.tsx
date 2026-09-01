import type { Metadata } from "next"

import { DoorScannerClient } from "@/components/admin/door-scanner-entry"

export const metadata: Metadata = {
  title: "Validador de acceso",
  description:
    "Validación de puerta TokePass: modo guardia (cámara) o tótem (USB HID).",
}

export default function AdminValidatorPage() {
  return <DoorScannerClient />
}
