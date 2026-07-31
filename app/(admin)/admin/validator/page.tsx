import type { Metadata } from "next"

import { DoorScanner } from "@/components/admin/door-scanner"

export const metadata: Metadata = {
  title: "Validador de acceso",
  description:
    "Validación de puerta Tokepass: modo guardia (cámara) o tótem (USB HID).",
}

export default function AdminValidatorPage() {
  return <DoorScanner />
}
