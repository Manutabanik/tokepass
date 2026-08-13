import type { Metadata } from "next"

import { AccountNotificationsPanel } from "@/components/account/account-notifications-panel"

export const metadata: Metadata = {
  title: "Notificaciones",
  description: "Novedades de tu cuenta Tokepass.",
}

export default function CuentaNotificacionesPage() {
  return <AccountNotificationsPanel />
}
