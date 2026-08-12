import type { Metadata } from "next"

import SeatSelectionDemoClient from "./page-client"

export const metadata: Metadata = {
  title: "Demo · Selección de asientos",
  robots: { index: false, follow: false },
}

export default function SeatSelectionDemoPage() {
  return <SeatSelectionDemoClient />
}
