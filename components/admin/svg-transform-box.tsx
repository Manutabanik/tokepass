"use client"

import { RotateCw } from "lucide-react"

import { transformHandleWorldSize } from "@/lib/seating/venue-touch"
import {
  rotationHandleAnchor,
  type BoundsRect,
  type ResizeHandle,
} from "@/lib/seating/venue-transform"

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
  isRotating = false,
  fatFinger = false,
  locked = false,
  children,
  onMoveStart,
  onResizeStart,
  onRotateStart,
}: {
  bounds: BoundsRect
  zoom: number
  grabbing?: boolean
  isRotating?: boolean
  fatFinger?: boolean
  locked?: boolean
  children?: React.ReactNode
  onMoveStart: (event: React.PointerEvent) => void
  onResizeStart: (handle: ResizeHandle, event: React.PointerEvent) => void
  onRotateStart: (event: React.PointerEvent) => void
}) {
  const z = Math.max(0.25, zoom)
  const stroke = 1 / z
  const pad = 6 / z
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
  const rotate = rotationHandleAnchor(box, zoom)
  const screen = 1 / z
  const knob = 16
  const hit = fatFinger ? 24 : 16

  const strokeClass = locked ? "stroke-rose-800/80" : "stroke-primary/40"

  return (
    <g data-transform-box="true" data-locked={locked ? "true" : undefined}>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="transparent"
        className={
          locked
            ? "cursor-not-allowed"
            : grabbing
              ? "cursor-grabbing"
              : "cursor-grab"
        }
        onPointerDown={(event) => {
          if (event.button !== 0 || locked) return
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
        className={strokeClass}
        strokeWidth={stroke}
        pointerEvents="none"
      />
      {!locked ? (
      <line
        x1={rotate.cx}
        y1={rotate.edgeY}
        x2={rotate.cx}
        y2={rotate.cy}
        className={strokeClass}
        strokeWidth={stroke}
        pointerEvents="none"
      />
      ) : null}
      {!locked && !isRotating
        ? HANDLE.map((handle) => {
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
                  rx={1.2 / z}
                  className="pointer-events-none fill-white stroke-primary/50"
                  strokeWidth={stroke}
                />
              </g>
            )
          })
        : null}
      {!locked ? (
      <g transform={`translate(${rotate.cx} ${rotate.cy}) scale(${screen})`}>
        <circle
          r={hit}
          className={
            isRotating
              ? "fill-transparent cursor-grabbing"
              : "fill-transparent cursor-grab"
          }
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            onRotateStart(event)
          }}
        />
        <circle
          r={knob}
          className="pointer-events-none fill-white stroke-slate-200"
          strokeWidth={1}
          style={{
            filter: "drop-shadow(0 2px 4px rgba(15, 23, 42, 0.16))",
          }}
        />
        <RotateCw
          size={14}
          x={-7}
          y={-7}
          className="pointer-events-none text-slate-600"
        />
      </g>
      ) : null}
    </g>
  )
}
