import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Native-feeling press feedback. Honors prefers-reduced-motion. */
export const tapFeedbackClass =
  "transition-transform duration-200 active:scale-95 motion-reduce:active:scale-100"
