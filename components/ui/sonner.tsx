"use client"

import { useEffect } from "react"
import { toast, Toaster as Sonner, type ToasterProps } from "sonner"

import {
  CHECKOUT_SOLD_OUT_DESCRIPTION,
  CHECKOUT_SOLD_OUT_TITLE,
  isBuyerSoldOutToast,
} from "@/lib/checkout/revalidate-seat-holds"
import { isAppErrorCode } from "@/lib/errors/app-error"
import { dispatchGuidedError, mapUnknownError } from "@/lib/errors/error-handler"
import { cn } from "@/lib/utils"

function maskToastMessage(value: unknown) {
  return typeof value === "string" ? mapUnknownError(value).message : value
}

function withSingleToast<T extends (...args: never[]) => unknown>(fn: T): T {
  return ((...args: never[]) => {
    toast.dismiss()
    return fn(...args)
  }) as T
}

export function Toaster({ className, ...props }: ToasterProps) {
  useEffect(() => {
    const originalError = toast.error.bind(toast)
    const originalSuccess = toast.success.bind(toast)
    const originalWarning = toast.warning.bind(toast)
    const originalInfo = toast.info.bind(toast)
    const originalMessage = toast.message.bind(toast)

    toast.success = withSingleToast(originalSuccess)
    toast.warning = withSingleToast(originalWarning)
    toast.info = withSingleToast(originalInfo)
    toast.message = withSingleToast(originalMessage)
    toast.error = ((message, data) => {
      toast.dismiss()
      const rawTitle = typeof message === "string" ? message.trim() : ""
      const rawDescription =
        data && typeof data === "object" ? data.description : undefined
      if (
        isBuyerSoldOutToast(rawTitle) ||
        (typeof rawDescription === "string" && isBuyerSoldOutToast(rawDescription))
      ) {
        return originalError(CHECKOUT_SOLD_OUT_TITLE, {
          description: CHECKOUT_SOLD_OUT_DESCRIPTION,
        })
      }
      const mappedTitle = mapUnknownError(message)
      const mappedDescription =
        typeof rawDescription === "string"
          ? mapUnknownError(rawDescription)
          : null
      const allowGuided =
        isAppErrorCode(rawTitle) ||
        (typeof rawDescription === "string" && isAppErrorCode(rawDescription.trim()))
      const guided = allowGuided
        ? mappedDescription?.action
          ? mappedDescription
          : mappedTitle.action
            ? mappedTitle
            : null
        : null
      const titleText =
        typeof maskToastMessage(message) === "string"
          ? String(maskToastMessage(message))
          : mappedTitle.message
      const descriptionText =
        mappedDescription?.message ??
        (typeof rawDescription === "string" ? rawDescription : undefined)
      const keepDescriptionNode =
        rawDescription != null && typeof rawDescription !== "string"
      const sameCopy =
        typeof descriptionText === "string" &&
        descriptionText.trim().replace(/\.+$/, "").toLocaleLowerCase("es-AR") ===
          titleText.trim().replace(/\.+$/, "").toLocaleLowerCase("es-AR")
      const nextDescription = sameCopy
        ? undefined
        : keepDescriptionNode
          ? rawDescription
          : descriptionText
      const nextData =
        data && typeof data === "object"
          ? {
              ...data,
              description: nextDescription,
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
      return originalError(titleText as never, nextData as never)
    }) as typeof toast.error
    return () => {
      toast.error = originalError
      toast.success = originalSuccess
      toast.warning = originalWarning
      toast.info = originalInfo
      toast.message = originalMessage
    }
  }, [])

  return (
    <Sonner
      theme="dark"
      className={cn("toaster group z-50", className)}
      toastOptions={{
        classNames: {
          toast:
            "group toast flex flex-col gap-1 p-4 border-white/10 bg-[#121217] text-zinc-100 shadow-xl",
          content: "flex flex-col gap-1",
          title: "break-words font-medium leading-snug",
          description: "break-words text-zinc-500 leading-snug",
          actionButton: "mt-1 shrink-0 self-start",
          success: "border-emerald-500/20",
          error: "border-red-500/20",
        },
      }}
      {...props}
      position="top-center"
      offset={24}
      visibleToasts={1}
    />
  )
}
