"use client"

import { usePathname } from "next/navigation"

import { isPublicEventStorefrontPath } from "@/lib/navigation/focused-flows"

export function SiteFooterSafeSpace() {
  const pathname = usePathname()
  if (!isPublicEventStorefrontPath(pathname)) return null

  return (
    <div
      className="h-[160px] bg-background lg:hidden"
      aria-hidden="true"
    />
  )
}
