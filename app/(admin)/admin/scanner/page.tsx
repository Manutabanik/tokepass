import type { Metadata } from "next"

import { DoorScanner } from "@/components/admin/door-scanner"

export const metadata: Metadata = {
  title: "Escáner web",
  description:
    "Validá entradas en la puerta, incluso sin conexión, y sincronizá después.",
}

export default function AdminScannerPage() {
  return <DoorScanner />
}
