import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Control de puerta",
  description: "Acceso temporal al escaner TokePass.",
  robots: { index: false, follow: false },
}

export default function DoorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-[100dvh] bg-[#05050a] text-white">{children}</div>
  )
}
