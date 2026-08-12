"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

export function LegalConsentCheckbox({
  checked,
  onCheckedChange,
  organizerName,
  disabled = false,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  organizerName: string
  disabled?: boolean
  className?: string
}) {
  const id = useId()

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-left backdrop-blur-xl transition",
        checked && "border-emerald-400/35 bg-emerald-500/10",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-emerald-500"
      />
      <span className="text-xs leading-5 text-zinc-300">
        Acepto los Términos del Evento y comprendo que la organización y
        devolución del dinero es responsabilidad exclusiva de{" "}
        <strong className="font-semibold text-white">{organizerName}</strong>.
      </span>
    </label>
  )
}
