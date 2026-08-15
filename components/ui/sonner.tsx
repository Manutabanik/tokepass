"use client"

import { useEffect } from "react"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"

import { toUserFacingError } from "@/lib/errors/user-facing-error"
import { cn } from "@/lib/utils"

function maskToastMessage(value: unknown) {
  return typeof value === "string" ? toUserFacingError(value) : value
}

export function Toaster({ className, ...props }: ToasterProps) {
  useEffect(() => {
    const originalError = toast.error.bind(toast)
    toast.error = ((message, data) => {
      const nextData =
        data && typeof data === "object"
          ? {
              ...data,
              description:
                typeof data.description === "string"
                  ? toUserFacingError(data.description)
                  : data.description,
            }
          : data
      return originalError(
        maskToastMessage(message) as never,
        nextData as never,
      )
    }) as typeof toast.error
    return () => {
      toast.error = originalError
    }
  }, [])

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
