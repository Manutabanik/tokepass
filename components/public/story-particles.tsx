"use client"

import { useReducedMotion } from "motion/react"
import { useEffect, useRef } from "react"

type Particle = {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  alpha: number
}

export function StoryParticles({
  color,
  paused = false,
}: {
  color: string
  paused?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  const reduceMotion = useReducedMotion()
  pausedRef.current = paused

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reduceMotion) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const width = 270
    const height = 480
    canvas.width = width
    canvas.height = height

    const particles: Particle[] = Array.from({ length: 28 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.8,
      speed: 0.12 + Math.random() * 0.28,
      drift: -0.12 + Math.random() * 0.24,
      alpha: 0.12 + Math.random() * 0.28,
    }))

    let frame = 0
    let running = true

    function draw() {
      if (!ctx || !running) return
      ctx.clearRect(0, 0, width, height)
      if (!pausedRef.current) {
        for (const particle of particles) {
          particle.y -= particle.speed
          particle.x += particle.drift
          if (particle.y < -4) {
            particle.y = height + 4
            particle.x = Math.random() * width
          }
          if (particle.x < -4) particle.x = width + 4
          if (particle.x > width + 4) particle.x = -4
        }
      }
      for (const particle of particles) {
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.globalAlpha = particle.alpha
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      running = false
      cancelAnimationFrame(frame)
    }
  }, [color, reduceMotion])

  if (reduceMotion) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.55,
        willChange: "transform",
        transform: "translateZ(0)",
      }}
    />
  )
}
