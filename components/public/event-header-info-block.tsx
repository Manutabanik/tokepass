import { cn } from "@/lib/utils"

export function HeaderInfoBlock({
  title,
  organizerName,
  className,
}: {
  title: string
  organizerName?: string | null
  className?: string
}) {
  const subtitle = organizerName?.trim() || null

  return (
    <header className={cn("px-4 md:px-0", className)}>
      <h1 className="mt-5 mb-1 line-clamp-2 break-words text-3xl font-black leading-tight tracking-tight text-foreground drop-shadow-sm sm:text-4xl lg:mt-8 lg:text-6xl dark:drop-shadow-lg">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm font-medium text-muted-foreground sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}
