"use client"

import { createElement } from "react"

import {
  getCategoryIconPickerOptions,
  resolveCategoryIcon,
} from "@/lib/category-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function CategoryIconMark({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return createElement(resolveCategoryIcon(name), {
    className,
    "aria-hidden": true,
  })
}

export function IconPicker({
  value,
  onChange,
  disabled = false,
  id,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  id?: string
}) {
  const options = getCategoryIconPickerOptions(value)
  const selected = options.find((option) => option.name === value) ?? options[0]
  const items = options.map((option) => ({
    value: option.name,
    label: option.label,
  }))

  return (
    <Select
      value={selected.name}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onChange(next)
      }}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="h-10 w-full">
        <SelectValue placeholder="Elegí un ícono">
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIconMark name={selected.name} className="size-4 shrink-0" />
            <span className="truncate">{selected.label}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger className="max-h-72">
        {options.map((option) => {
          const Icon = resolveCategoryIcon(option.name)
          return (
            <SelectItem key={option.name} value={option.name}>
              {createElement(Icon, {
                className: "size-4 shrink-0",
                "aria-hidden": true,
              })}
              <span>{option.label}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
