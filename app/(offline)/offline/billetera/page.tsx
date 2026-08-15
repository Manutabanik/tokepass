import type { Metadata } from "next"

import { DeviceWalletScreen } from "@/components/pwa/device-wallet-screen"

export const metadata: Metadata = {
  title: "Entradas sin conexión",
  description: "QR de ingreso disponible desde este dispositivo.",
}

export default function OfflineBilleteraPage() {
  return <DeviceWalletScreen />
}
