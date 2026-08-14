"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useState, useTransition } from "react"

import { updateUserRole } from "@/app/actions/platform"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/database"

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "customer", label: "Cliente" },
  { value: "admin", label: "Organizador" },
  { value: "super_admin", label: "Dueño de la plataforma" },
]

export function UserRoleManager({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string
  currentRole: UserRole
  isSelf: boolean
}) {
  const [role, setRole] = useState<UserRole>(currentRole)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = role !== currentRole

  if (isSelf) {
    return (
      <span className="text-xs text-muted-foreground">Tu cuenta</span>
    )
  }

  function handleSave() {
    setFeedback(null)
    startTransition(async () => {
      const result = await updateUserRole(userId, role)
      if (result.success) {
        setIsError(false)
        setFeedback("Guardado")
      } else {
        setIsError(true)
        setFeedback(result.error)
        setRole(currentRole)
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {feedback && (
        <span
          className={cn(
            "text-xs",
            isError ? "text-red-400" : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {feedback}
        </span>
      )}
      <Select
        value={role}
        onValueChange={(value) => {
          setRole(value as UserRole)
          setFeedback(null)
        }}
        items={roleOptions.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-36 max-w-full overflow-hidden border-border bg-background"
        >
          <SelectValue>
            {roleOptions.find((option) => option.value === role)?.label ?? null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon-sm"
        disabled={!dirty || isPending}
        onClick={handleSave}
        className="bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40"
        aria-label="Guardar rol"
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Check />
        )}
      </Button>
    </div>
  )
}
