import { AccountPortalLayout } from "@/components/account/account-portal-layout"

export default function CuentaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccountPortalLayout loginNext="/cuenta">{children}</AccountPortalLayout>
  )
}
