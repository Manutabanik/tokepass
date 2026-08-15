"use client"

import { useEffect } from "react"
import { useTransform, type MotionValue } from "motion/react"

import { useStoryTilt } from "@/hooks/use-story-tilt"
import { specularFromTilt } from "@/lib/story-tilt"

export function use3DTilt(enabled: boolean): {
  rotateX: MotionValue<number>
  rotateY: MotionValue<number>
  onPointerMove: ReturnType<typeof useStoryTilt>["onPointerMove"]
  onPointerLeave: ReturnType<typeof useStoryTilt>["onPointerLeave"]
  enableGyro: ReturnType<typeof useStoryTilt>["enableGyro"]
  holoBackground: MotionValue<string>
  perspectiveStyle: { perspective: string }
} {
  const tilt = useStoryTilt(enabled)
  const { enableGyro, rotateX, rotateY, onPointerMove, onPointerLeave } = tilt
  const holoBackground = useTransform([rotateX, rotateY], (values) => {
    const spec = specularFromTilt({
      x: Number(values[0]) || 0,
      y: Number(values[1]) || 0,
    })
    return `linear-gradient(${spec.angle}deg, rgba(255,255,255,0) 18%, rgba(232,121,249,0.28) 46%, rgba(34,211,238,0.18) 58%, rgba(255,255,255,0) 78%)`
  })

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    const Orientation = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>
        })
      | undefined
    if (typeof Orientation?.requestPermission !== "function") {
      void enableGyro()
    }
  }, [enabled, enableGyro])

  return {
    rotateX,
    rotateY,
    onPointerMove,
    onPointerLeave,
    enableGyro,
    holoBackground,
    perspectiveStyle: { perspective: "1000px" },
  }
}
