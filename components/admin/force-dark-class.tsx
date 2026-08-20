"use client"

import { useLayoutEffect } from "react"

const THEME_STORAGE_KEY = "theme"

function shouldKeepDarkAfterUnmount() {
  if (typeof window === "undefined") return false
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "dark") return true
  if (stored === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function ForceDarkClass() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previousScheme = root.style.colorScheme

    const apply = () => {
      root.classList.add("dark")
      root.style.colorScheme = "dark"
    }

    apply()
    const observer = new MutationObserver(() => {
      if (!root.classList.contains("dark")) apply()
    })
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })

    return () => {
      observer.disconnect()
      if (shouldKeepDarkAfterUnmount()) {
        root.classList.add("dark")
        root.style.colorScheme = "dark"
        return
      }
      root.classList.remove("dark")
      root.style.colorScheme = previousScheme
    }
  }, [])

  return null
}
