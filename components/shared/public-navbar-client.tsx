"use client"

import { MapPin, Search, UserRound, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"

import { useDiscoveryControls } from "@/components/discovery/discovery-controls-store"
import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { buildSearchSuggestions } from "@/lib/discovery-filters"
import { cn } from "@/lib/utils"

export function PublicNavbarClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean
}) {
  const controls = useDiscoveryControls()
  const router = useRouter()
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [localQuery, setLocalQuery] = useState("")
  const [localCity, setLocalCity] = useState("todas")
  const [open, setOpen] = useState(false)

  const query = controls?.query ?? localQuery
  const city = controls?.city ?? localCity
  const cities = controls?.cities ?? []
  const events = controls?.events ?? []

  const suggestions = useMemo(
    () => buildSearchSuggestions(events, query),
    [events, query],
  )

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  function setQuery(value: string) {
    if (controls) controls.onQueryChange(value)
    else setLocalQuery(value)
    setOpen(value.trim().length >= 2)
  }

  function setCity(value: string) {
    if (controls) controls.onCityChange(value)
    else setLocalCity(value)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setOpen(false)
    if (controls) {
      document.getElementById("discovery-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      return
    }
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    router.push(params.size ? `/events?${params}` : "/events")
  }

  const cityLabel =
    city === "todas"
      ? "Todo el país"
      : cities.find((item) => item.toLowerCase() === city) ?? city

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b",
        "border-zinc-200/80 bg-white/85 backdrop-blur-xl",
        "dark:border-white/8 dark:bg-zinc-950/85",
      )}
    >
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-[4.25rem] sm:gap-4 sm:px-4 lg:gap-6 lg:px-8">
        <BrandLogo size="header" className="shrink-0" />

        <div ref={wrapRef} className="relative mx-auto w-full max-w-xl">
          <form
            onSubmit={handleSubmit}
            className={cn(
              "flex items-center gap-2 rounded-full border pl-3 pr-1.5 transition-colors",
              "border-zinc-200 bg-zinc-100/80 focus-within:border-zinc-300",
              "dark:border-white/10 dark:bg-zinc-900/80 dark:focus-within:border-white/20",
            )}
          >
            <Search
              className="size-4 shrink-0 text-zinc-500"
              aria-hidden="true"
            />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Buscar eventos</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setOpen(query.trim().length >= 2)}
                placeholder="Evento, artista o provincia…"
                autoComplete="off"
                role="combobox"
                aria-expanded={open && suggestions.length > 0}
                aria-controls={listId}
                className="h-10 w-full border-0 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white"
              />
            </label>
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="grid size-8 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-900 dark:hover:bg-white/5 dark:hover:text-white"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </form>

          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-zinc-900/95 dark:backdrop-blur-xl"
            >
              {suggestions.map((item) => (
                <li key={item.id} role="option">
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 transition hover:bg-zinc-100 dark:hover:bg-white/5"
                  >
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                      {item.label}
                    </p>
                    {item.meta ? (
                      <p className="truncate text-xs text-zinc-500">
                        {item.meta}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <Select
            value={city}
            onValueChange={(value) => value && setCity(value)}
          >
            <SelectTrigger
              className={cn(
                "h-9 max-w-[7.5rem] gap-1 rounded-full border px-2.5 text-xs font-medium shadow-none sm:max-w-[12rem] sm:px-3 sm:text-sm",
                "border-zinc-200 bg-transparent text-zinc-700 hover:bg-zinc-100",
                "dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white",
                "focus-visible:ring-0",
              )}
              aria-label={`Ubicación: ${cityLabel}`}
            >
              <MapPin className="size-3.5 shrink-0 text-zinc-400" />
              <SelectValue placeholder="Todo el país" />
            </SelectTrigger>
            <SelectContent
              align="end"
              className="max-h-64 rounded-xl border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <SelectItem value="todas">Todo el país</SelectItem>
              {cities.map((item) => (
                <SelectItem key={item} value={item.toLowerCase()}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <Link
                href="/my-tickets"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 sm:px-3.5"
              >
                <UserRound className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Mi cuenta</span>
              </Link>
              <SignOutButton
                showLabel={false}
                className="hidden rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white md:inline-flex"
              />
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-full bg-zinc-950 px-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:px-4"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
