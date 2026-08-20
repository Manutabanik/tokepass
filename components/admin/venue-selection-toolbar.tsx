"use client"

import {
  AlignCenterVertical as AlignCenter,
  AlignHorizontalDistributeCenter,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Group,
  Lock,
  Ungroup,
  Unlock,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-8 text-slate-600"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function VenueSelectionToolbar({
  x,
  y,
  placement = "above",
  locked = false,
  fullyLocked = locked,
  canGroup = true,
  canUngroup,
  canAlign = false,
  onToggleLock,
  onGroup,
  onUngroup,
  onAlignCenter,
  onDistributeHorizontal,
  onFlipHorizontal,
  onFlipVertical,
  onDuplicate,
  className,
}: {
  x: number
  y: number
  placement?: "above" | "below"
  locked?: boolean
  fullyLocked?: boolean
  canGroup?: boolean
  canUngroup: boolean
  canAlign?: boolean
  onToggleLock: () => void
  onGroup: () => void
  onUngroup: () => void
  onAlignCenter: () => void
  onDistributeHorizontal: () => void
  onFlipHorizontal: () => void
  onFlipVertical: () => void
  onDuplicate: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-50 flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg",
        className,
      )}
      style={{
        left: x,
        top: y,
        transform:
          placement === "above"
            ? "translate(-50%, calc(-100% - 10px))"
            : "translate(-50%, 10px)",
      }}
      role="toolbar"
      aria-label="Acciones de seleccion"
    >
      <ToolbarButton
        label={fullyLocked ? "Desbloquear posicion" : "Bloquear posicion"}
        onClick={onToggleLock}
      >
        {fullyLocked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
      </ToolbarButton>
      {canAlign ? (
        <>
          <ToolbarButton
            label="Alinear al centro"
            disabled={locked}
            onClick={onAlignCenter}
          >
            <AlignCenter className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Distribuir horizontalmente"
            disabled={locked}
            onClick={onDistributeHorizontal}
          >
            <AlignHorizontalDistributeCenter className="size-4" />
          </ToolbarButton>
        </>
      ) : null}
      {canGroup ? (
        <ToolbarButton label="Agrupar" disabled={locked} onClick={onGroup}>
          <Group className="size-4" />
        </ToolbarButton>
      ) : null}
      <ToolbarButton
        label="Desagrupar"
        disabled={!canUngroup}
        onClick={onUngroup}
      >
        <Ungroup className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Voltear horizontal"
        disabled={locked}
        onClick={onFlipHorizontal}
      >
        <FlipHorizontal className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Voltear vertical"
        disabled={locked}
        onClick={onFlipVertical}
      >
        <FlipVertical className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Duplicar" onClick={onDuplicate}>
        <Copy className="size-4" />
      </ToolbarButton>
    </div>
  )
}
