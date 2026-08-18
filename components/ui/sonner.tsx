"use client"

import { useEffect } from "react"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"

import { dispatchGuidedError, mapUnknownError } from "@/lib/errors/error-handler"
import { cn } from "@/lib/utils"

function maskToastMessage(value: unknown) {
  return typeof value === "string" ? mapUnknownError(value).message : value
}

export function Toaster({ className, ...props }: ToasterProps) {
  useEffect(() => {
    const originalError = toast.error.bind(toast)
    toast.error = ((message, data) => {
      const mappedTitle = mapUnknownError(message)
      const mappedDescription =
        data && typeof data === "object" && typeof data.description === "string"
          ? mapUnknownError(data.description)
          : null
      const guided = mappedDescription?.action
        ? mappedDescription
        : mappedTitle.action
          ? mappedTitle
          : null
      const nextData =
        data && typeof data === "object"
          ? {
              ...data,
              description:
                mappedDescription?.message ??
                (typeof data.description === "string"
                  ? data.description
                  : data.description),
              action:
                data.action ??
                (guided?.action
                  ? {
                      label: guided.action.label,
                      onClick: () => dispatchGuidedError(guided.action!),
                    }
                  : undefined),
            }
          : guided?.action
            ? {
                action: {
                  label: guided.action.label,
                  onClick: () => dispatchGuidedError(guided.action!),
                },
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
