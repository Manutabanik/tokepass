"use client"

import type { BoundsRect, ResizeHandle } from "@/lib/seating/venue-transform"

const HANDLE: ResizeHandle[] = ["nw", "ne", "sw", "se"]

function handleCursor(handle: ResizeHandle) {
  return handle === "nw" || handle === "se"
    ? "cursor-nwse-resize"
    : "cursor-nesw-resize"
}

function handlePoint(bounds: BoundsRect, handle: ResizeHandle) {
  if (handle === "nw") return { x: bounds.x, y: bounds.y }
  if (handle === "ne") return { x: bounds.x + bounds.width, y: bounds.y }
  if (handle === "sw") return { x: bounds.x, y: bounds.y + bounds.height }
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
}

export function SvgTransformBox({
  bounds,
  zoom,
  grabbing = false,
  children,
  onMoveStart,
  onResizeStart,
  onRotateStart,
}: {
  bounds: BoundsRect
  zoom: number
  grabbing?: boolean
  children?: React.ReactNode
  onMoveStart: (event: React.PointerEvent) => void
  onResizeStart: (handle: ResizeHandle, event: React.PointerEvent) => void
  onRotateStart: (event: React.PointerEvent) => void
}) {
  const pad = 6 / Math.max(0.25, zoom)
  const box = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  }
  const handleSize = 8 / Math.max(0.25, zoom)
  const rotateLift = 20 / Math.max(0.25, zoom)
  const topCx = box.x + box.width / 2
  const rotateY = box.y - rotateLift

  return (
    <g data-transform-box="true">
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="transparent"
        className={grabbing ? "cursor-grabbing" : "cursor-grab"}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.button !== 0) return
          onMoveStart(event)
        }}
      />
      {children}
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="none"
        className="stroke-emerald-400"
        strokeWidth={1.25 / Math.max(0.25, zoom)}
        pointerEvents="none"
      />
      <line
        x1={topCx}
        y1={box.y}
        x2={topCx}
        y2={rotateY}
        className="stroke-emerald-400"
        strokeWidth={1.25 / Math.max(0.25, zoom)}
        pointerEvents="none"
      />
      <circle
        cx={topCx}
        cy={rotateY}
        r={handleSize / 1.6}
        className="fill-emerald-400 stroke-white cursor-grab"
        strokeWidth={1 / Math.max(0.25, zoom)}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.button !== 0) return
          onRotateStart(event)
        }}
      />
      {HANDLE.map((handle) => {
        const point = handlePoint(box, handle)
        return (
          <rect
            key={handle}
            x={point.x - handleSize / 2}
            y={point.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={1.2 / Math.max(0.25, zoom)}
            className={`fill-white stroke-emerald-500 ${handleCursor(handle)}`}
            strokeWidth={1.2 / Math.max(0.25, zoom)}
            onPointerDown={(event) => {
              event.stopPropagation()
              if (event.button !== 0) return
              onResizeStart(handle, event)
            }}
          />
        )
      })}
    </g>
  )
}
