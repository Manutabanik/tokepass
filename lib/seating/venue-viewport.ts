export function fallbackWorldCenter(width: number, height: number) {
  return {
    x: width / 2,
    y: height / 2,
  }
}

/** Convert a viewBox/screen-mapped point into canvas world coordinates. */
export function worldPointFromViewBox(
  view: { x: number; y: number },
  pan: { x: number; y: number },
  zoom: number,
) {
  const z = Number.isFinite(zoom) && zoom !== 0 ? zoom : 1
  return {
    x: (view.x - pan.x) / z,
    y: (view.y - pan.y) / z,
  }
}
