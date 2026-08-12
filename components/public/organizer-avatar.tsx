"use client"

import Image from "next/image"

import { cn } from "@/lib/utils"

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function OrganizerAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string
  avatarUrl?: string | null
  className?: string
}) {
  const initials = initialsFromName(name) || "TP"

  return (
    <span
      className={cn(
        "relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-500/25 text-sm font-black text-violet-100 ring-1 ring-violet-400/25",
        className,
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name}
          fill
          className="object-cover"
          sizes="48px"
          unoptimized
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  )
}
