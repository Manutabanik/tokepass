import { AccountPortalLayout } from "@/components/account/account-portal-layout"

export default function ProfileTicketsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccountPortalLayout loginNext="/profile/tickets">
      {children}
    </AccountPortalLayout>
  )
}
