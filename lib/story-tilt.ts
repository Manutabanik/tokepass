export const STORY_TILT_MAX = 12

export type StoryTilt = {
  x: number
  y: number
}

export function clampStoryTilt(
  x: number,
  y: number,
  max = STORY_TILT_MAX,
): StoryTilt {
  return {
    x: Math.max(-max, Math.min(max, x)) || 0,
    y: Math.max(-max, Math.min(max, y)) || 0,
  }
}

export function tiltFromPointer(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  max = STORY_TILT_MAX,
): StoryTilt {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 }
  const px = (offsetX / width) * 2 - 1
  const py = (offsetY / height) * 2 - 1
  return clampStoryTilt(-py * max, px * max, max)
}

export function tiltFromOrientation(
  beta: number,
  gamma: number,
  max = 10,
): StoryTilt {
  const x = ((beta - 45) / 45) * max
  const y = (gamma / 45) * max
  return clampStoryTilt(x, y, max)
}

export function specularFromTilt(tilt: StoryTilt): {
  angle: number
  x: number
  y: number
} {
  return {
    angle: 118 + tilt.y * 2.4,
    x: 50 + tilt.y * 1.8,
    y: 42 - tilt.x * 1.8,
  }
}
