"use client"

import type { Ref } from "react"

import { isCloseToFirstVertex } from "@/lib/seating/venue-polygon"
import type { VenueMapPoint } from "@/types/venue-map"

export type PolygonCursorNodes = {
  cursor: SVGCircleElement | null
  line: SVGLineElement | null
  closeRing: SVGCircleElement | null
}

function hideNode(node: SVGElement | null) {
  if (!node) return
  node.setAttribute("visibility", "hidden")
}

export function hidePolygonCursor(nodes: PolygonCursorNodes) {
  hideNode(nodes.cursor)
  hideNode(nodes.line)
  hideNode(nodes.closeRing)
}

export function paintPolygonCursor(
  nodes: PolygonCursorNodes,
  point: VenueMapPoint | null,
  draft: VenueMapPoint[],
) {
  const cursor = nodes.cursor
  const line = nodes.line
  const ring = nodes.closeRing
  if (!point) {
    hidePolygonCursor(nodes)
    return
  }
  if (cursor) {
    cursor.setAttribute("cx", String(point.x))
    cursor.setAttribute("cy", String(point.y))
    cursor.setAttribute("visibility", "visible")
  }
  const last = draft[draft.length - 1]
  if (line) {
    if (last) {
      line.setAttribute("x1", String(last.x))
      line.setAttribute("y1", String(last.y))
      line.setAttribute("x2", String(point.x))
      line.setAttribute("y2", String(point.y))
      line.setAttribute("visibility", "visible")
    } else {
      hideNode(line)
    }
  }
  const first = draft[0]
  if (ring) {
    if (first && isCloseToFirstVertex(draft, point)) {
      ring.setAttribute("cx", String(first.x))
      ring.setAttribute("cy", String(first.y))
      ring.setAttribute("visibility", "visible")
    } else {
      hideNode(ring)
    }
  }
}

export function PolygonCursorOverlay({
  cursorRef,
  lineRef,
  closeRingRef,
}: {
  cursorRef: Ref<SVGCircleElement>
  lineRef: Ref<SVGLineElement>
  closeRingRef: Ref<SVGCircleElement>
}) {
  return (
    <g className="pointer-events-none" aria-hidden>
      <line
        ref={lineRef}
        visibility="hidden"
        fill="none"
        stroke="#67e8f9"
        strokeWidth={2}
        strokeDasharray="7 5"
        strokeLinejoin="round"
      />
      <circle
        ref={closeRingRef}
        r={11}
        visibility="hidden"
        className="fill-none stroke-cyan-200"
        strokeWidth={1.4}
      />
      <circle
        ref={cursorRef}
        r={3.4}
        visibility="hidden"
        className="fill-cyan-300 stroke-cyan-950"
        strokeWidth={1}
      />
    </g>
  )
}
