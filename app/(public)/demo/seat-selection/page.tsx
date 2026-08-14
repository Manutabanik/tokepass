import type { Metadata } from "next"
import { notFound } from "next/navigation"

import SeatSelectionDemoClient from "./page-client"

export const metadata: Metadata = {
  title: "Demo · Selección de asientos",
  robots: { index: false, follow: false },
}

export default function SeatSelectionDemoPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return <SeatSelectionDemoClient />
}
