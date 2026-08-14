"use client"

import { useMemo, useState } from "react"

import type {
  GuestListEntryRow,
  GuestListSummary,
} from "@/app/actions/guest-lists"
import { GuestListDetailPanel } from "@/components/admin/guest-list-detail-panel"
import { cn } from "@/lib/utils"

export function GuestListsManager({
  lists,
  entriesByListId,
}: {
  lists: GuestListSummary[]
  entriesByListId: Record<string, GuestListEntryRow[]>
}) {
  const [selectedId, setSelectedId] = useState(lists[0]?.id ?? null)

  const selected = useMemo(
    () => lists.find((list) => list.id === selectedId) ?? null,
    [lists, selectedId],
  )

  if (lists.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-zinc-200 dark:border-white/10 px-6 py-16 text-center text-sm text-muted-foreground">
        Creá tu primera lista para empezar a emitir FreePass.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {lists.map((list) => (
          <button
            key={list.id}
            type="button"
            onClick={() => setSelectedId(list.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
              selectedId === list.id
                ? "bg-white text-zinc-950"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            {list.name}
            <span className="ml-2 text-xs opacity-70">
              {list.usedGuests}/{list.maxGuests}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <GuestListDetailPanel
          list={selected}
          entries={entriesByListId[selected.id] ?? []}
        />
      )}
    </div>
  )
}
