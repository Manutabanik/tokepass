"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

import { cn } from "@/lib/utils"

export function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className={cn("toaster group", className)}
      toastOptions={{
        classNames: {
          toast:
            "group toast border-white/10 bg-[#121217] text-zinc-100 shadow-xl",
          description: "text-zinc-500",
          success: "border-emerald-500/20",
          error: "border-red-500/20",
        },
      }}
      {...props}
    />
  )
}
