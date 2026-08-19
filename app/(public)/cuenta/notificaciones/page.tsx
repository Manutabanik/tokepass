import type { Metadata } from "next"

import { AccountNotificationsPanel } from "@/components/account/account-notifications-panel"

export const metadata: Metadata = {
  title: "Notificaciones",
  description: "Novedades de tu cuenta TokePass.",
}

export default function CuentaNotificacionesPage() {
  return <AccountNotificationsPanel />
}
