"use client"

import dynamic from "next/dynamic"

import type { ScannerEventOption } from "@/lib/scanner/scanner-catalog-types"

const DoorScanner = dynamic(
  () =>
    import("@/components/admin/door-scanner").then((mod) => mod.DoorScanner),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-dvh place-items-center bg-[#05050a] px-6 text-center text-sm text-white/70">
        Preparando control de puerta…
      </div>
    ),
  },
)

export function DoorScannerClient({
  guestEvent,
}: {
  guestEvent?: ScannerEventOption
} = {}) {
  return <DoorScanner guestEvent={guestEvent} />
}
