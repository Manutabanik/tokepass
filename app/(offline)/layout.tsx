import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Billetera offline",
  description: "Tus entradas Tokepass disponibles sin conexión.",
  robots: { index: false, follow: false },
}

export default function OfflineLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-[100dvh] bg-[#090014] text-zinc-50">
      {children}
    </div>
  )
}
