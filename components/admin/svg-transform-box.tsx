"use client"

import { transformHandleWorldSize } from "@/lib/seating/venue-touch"
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
  fatFinger = false,
  children,
  onMoveStart,
  onResizeStart,
  onRotateStart,
}: {
  bounds: BoundsRect
  zoom: number
  grabbing?: boolean
  fatFinger?: boolean
  children?: React.ReactNode
  onMoveStart: (event: React.PointerEvent) => void
  onResizeStart: (handle: ResizeHandle, event: React.PointerEvent) => void
  onRotateStart: (event: React.PointerEvent) => void
}) {
  const stroke = 1 / Math.max(0.25, zoom)
  const pad = 6 / Math.max(0.25, zoom)
  const box = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
  }
  const { visual: handleSize, hit: hitSize } = transformHandleWorldSize(
    zoom,
    fatFinger,
  )
  const rotateLift = 22 / Math.max(0.25, zoom)
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
          if (event.button !== 0) return
          event.stopPropagation()
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
        className="stroke-sky-500"
        strokeWidth={stroke}
        pointerEvents="none"
      />
      <line
        x1={topCx}
        y1={box.y}
        x2={topCx}
        y2={rotateY}
        className="stroke-sky-500"
        strokeWidth={stroke}
        pointerEvents="none"
      />
      <circle
        cx={topCx}
        cy={rotateY}
        r={hitSize / 2}
        className="fill-transparent cursor-grab"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.stopPropagation()
          onRotateStart(event)
        }}
      />
      <circle
        cx={topCx}
        cy={rotateY}
        r={handleSize / 1.55}
        className="fill-sky-500 stroke-white pointer-events-none"
        strokeWidth={stroke}
      />
      {HANDLE.map((handle) => {
        const point = handlePoint(box, handle)
        return (
          <g key={handle}>
            <rect
              x={point.x - hitSize / 2}
              y={point.y - hitSize / 2}
              width={hitSize}
              height={hitSize}
              className={`fill-transparent ${handleCursor(handle)}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                onResizeStart(handle, event)
              }}
            />
            <rect
              x={point.x - handleSize / 2}
              y={point.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={1.2 / Math.max(0.25, zoom)}
              className="pointer-events-none fill-white stroke-sky-500"
              strokeWidth={stroke}
            />
          </g>
        )
      })}
    </g>
  )
}
