"use client"

import { Delete } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const

export function PosNumpad({
  value,
  onChange,
  maxLength = 4,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  maxLength?: number
  disabled?: boolean
}) {
  function press(key: (typeof KEYS)[number]) {
    if (disabled || !key) return
    if (key === "back") {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length >= maxLength) return
    onChange(`${value}${key}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        {Array.from({ length: maxLength }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "flex size-11 items-center justify-center rounded-xl border-2 font-mono text-xl font-black",
              value.length > index
                ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {value.length > index ? "*" : ""}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span key={`empty-${index}`} />
          ) : (
            <Button
              key={key}
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => press(key)}
              className="h-14 rounded-xl text-xl font-black"
            >
              {key === "back" ? <Delete className="size-5" /> : key}
            </Button>
          ),
        )}
      </div>
    </div>
  )
}
