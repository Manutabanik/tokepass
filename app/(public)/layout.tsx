import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  )
}
