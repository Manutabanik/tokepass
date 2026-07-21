import type { Metadata } from "next"

import { DoorScanner } from "@/components/admin/door-scanner"

export const metadata: Metadata = {
  title: "Zero-Offline Scanner",
  description:
    "Validación de puerta Tokepass con manifiesto offline y sync diferido.",
}

export default function AdminScannerPage() {
  return <DoorScanner />
}
