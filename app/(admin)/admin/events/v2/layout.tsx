import type { Metadata } from "next"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Event Creator V2",
  robots: { index: false, follow: false },
}

export default function EventCreatorV2Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
