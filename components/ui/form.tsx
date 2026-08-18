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
      className={cn("text-sm text-zinc-300", className)}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="form-description"
      className={cn("text-xs leading-5 text-zinc-500", className)}
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

  return (
    <p
      role="alert"
      data-slot="form-message"
      className={cn("text-xs font-medium text-red-600 dark:text-red-400", className)}
      {...props}
    >
      {children}
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
