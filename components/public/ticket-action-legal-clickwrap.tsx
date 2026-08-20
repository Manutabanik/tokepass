"use client"

import Link from "next/link"
import { useId } from "react"

import { LEGAL_PRIVACY_HREF, LEGAL_TERMS_HREF } from "@/lib/legal/site"
import { cn } from "@/lib/utils"

export function TicketActionLegalClickwrap({
  checked,
  onCheckedChange,
  disabled = false,
  actionLabel,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  actionLabel: string
  className?: string
}) {
  const id = useId()

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition",
        checked && "border-primary/40 bg-primary/5",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        required
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="text-xs leading-5 text-muted-foreground">
        He leído y acepto los{" "}
        <Link
          href={LEGAL_TERMS_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
          onClick={(event) => event.stopPropagation()}
        >
          Términos y Condiciones
        </Link>{" "}
        y la{" "}
        <Link
          href={LEGAL_PRIVACY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
          onClick={(event) => event.stopPropagation()}
        >
          Política de Privacidad
        </Link>
        . Entiendo que {actionLabel} y que TokePass no se responsabiliza por el
        uso posterior de la entrada ni por reclamos entre particulares.
      </span>
    </label>
  )
}
