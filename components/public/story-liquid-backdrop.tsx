"use client"

import { motion, useReducedMotion } from "motion/react"

import { storyLiquidLayers, type StoryTheme } from "@/lib/story-canvas"

export function StoryLiquidBackdrop({
  theme,
  frozen = false,
}: {
  theme: StoryTheme
  frozen?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const layers = storyLiquidLayers(theme)
  const still = frozen || reduceMotion

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {theme.overlay ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: theme.overlay,
          }}
        />
      ) : null}
      {layers.map((orb, index) => (
        <motion.div
          key={`${theme.id}-${index}`}
          initial={false}
          animate={
            still
              ? { scale: 1, rotate: 0, x: 0, y: 0 }
              : {
                  scale: [1, 1.16, 0.9, 1.08, 1],
                  rotate: [0, 14 + index * 6, -10 - index * 4, 8, 0],
                  x: [0, 36 - index * 10, -28, 16, 0],
                  y: [0, -22 - index * 8, 18, -10, 0],
                }
          }
          transition={
            still
              ? { duration: 0.2 }
              : {
                  duration: 16 + index * 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          style={{
            position: "absolute",
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            marginLeft: -orb.size / 2,
            marginTop: -orb.size / 2,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "999px",
              background: `radial-gradient(circle at 50% 50%, ${orb.color} 0%, transparent 68%)`,
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}
