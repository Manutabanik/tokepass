import type { Metadata } from "next"
import { Suspense } from "react"

import { DeviceWalletScreen } from "@/components/pwa/device-wallet-screen"

export const metadata: Metadata = {
  title: "Entradas sin conexión",
  description: "QR de ingreso disponible desde este dispositivo.",
}

export default function OfflineBilleteraPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-lg px-4 py-12 text-center text-sm text-zinc-400">
          Cargando billetera local…
        </div>
      }
    >
      <DeviceWalletScreen />
    </Suspense>
  )
}
