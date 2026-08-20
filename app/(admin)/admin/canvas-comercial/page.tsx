import type { Metadata } from "next"

import { CommercialCanvas } from "@/components/admin/commercial-canvas"

export const metadata: Metadata = {
  title: "Canvas comercial",
  description:
    "Argumentario para mostrarle al productor por que TokePass le conviene mas que una tiquetera tradicional.",
  robots: { index: false, follow: false },
}

export default function AdminCommercialCanvasPage() {
  return <CommercialCanvas />
}
