"use client"

import {
  useMotionValue,
  useReducedMotion,
  useSpring,
  type MotionValue,
} from "motion/react"
import { useCallback, useEffect, useRef, type PointerEvent } from "react"

import {
  STORY_TILT_MAX,
  tiltFromOrientation,
  tiltFromPointer,
} from "@/lib/story-tilt"

type DeviceOrientation = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">
}

const spring = { stiffness: 240, damping: 22, mass: 0.35 }

export function useStoryTilt(enabled: boolean): {
  rotateX: MotionValue<number>
  rotateY: MotionValue<number>
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  enableGyro: () => Promise<void>
} {
  const reduceMotion = useReducedMotion()
  const gyroOn = useRef(false)
  const rotateXRaw = useMotionValue(0)
  const rotateYRaw = useMotionValue(0)
  const rotateX = useSpring(rotateXRaw, spring)
  const rotateY = useSpring(rotateYRaw, spring)

  const reset = useCallback(() => {
    rotateXRaw.set(0)
    rotateYRaw.set(0)
  }, [rotateXRaw, rotateYRaw])

  useEffect(() => {
    if (!enabled || reduceMotion) reset()
  }, [enabled, reduceMotion, reset])

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || reduceMotion || gyroOn.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      const tilt = tiltFromPointer(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        STORY_TILT_MAX,
      )
      rotateXRaw.set(tilt.x)
      rotateYRaw.set(tilt.y)
    },
    [enabled, reduceMotion, rotateXRaw, rotateYRaw],
  )

  const onPointerLeave = useCallback(() => {
    if (gyroOn.current) return
    reset()
  }, [reset])

  const enableGyro = useCallback(async () => {
    if (!enabled || reduceMotion || typeof window === "undefined") return
    const Orientation = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & DeviceOrientation)
      | undefined
    try {
      if (typeof Orientation?.requestPermission === "function") {
        const permission = await Orientation.requestPermission()
        if (permission !== "granted") return
      }
    } catch {
      return
    }
    gyroOn.current = true
  }, [enabled, reduceMotion])

  useEffect(() => {
    if (!enabled || reduceMotion) return

    function onOrientation(event: DeviceOrientationEvent) {
      if (!gyroOn.current) return
      if (event.beta == null || event.gamma == null) return
      const tilt = tiltFromOrientation(event.beta, event.gamma)
      rotateXRaw.set(tilt.x)
      rotateYRaw.set(tilt.y)
    }

    window.addEventListener("deviceorientation", onOrientation, true)
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true)
      gyroOn.current = false
    }
  }, [enabled, reduceMotion, rotateXRaw, rotateYRaw])

  return {
    rotateX,
    rotateY,
    onPointerMove,
    onPointerLeave,
    enableGyro,
  }
}
