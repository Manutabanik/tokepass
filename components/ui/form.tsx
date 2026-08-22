"use client"

import type { ComponentProps } from "react"
import {
  Controller,
  FormProvider,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { Label } from "@/components/ui/label"
import { FIELD_REVIEW_HINT } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"

const Form = FormProvider

function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return <Controller {...props} />
}

function FormItem({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="form-item"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function FormLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="form-label"
      className={cn(
        "mb-1.5 text-sm font-bold text-slate-800 dark:text-zinc-200",
        className,
      )}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="form-description"
      className={cn(
        "text-xs leading-5 text-slate-500 dark:text-zinc-400",
        className,
      )}
      {...props}
    />
  )
}

function FormMessage({
  className,
  children,
  ...props
}: ComponentProps<"p">) {
  if (!children) return null
  const copy = typeof children === "string" ? children.trim() : ""
  const showHint = copy.length > 0 && copy !== FIELD_REVIEW_HINT

  return (
    <p
      role="alert"
      data-slot="form-message"
      className={cn("text-xs font-medium text-red-600 dark:text-red-400", className)}
      {...props}
    >
      {children}
      {showHint ? (
        <span className="mt-0.5 block font-normal">{FIELD_REVIEW_HINT}</span>
      ) : null}
    </p>
  )
}

export {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
}
