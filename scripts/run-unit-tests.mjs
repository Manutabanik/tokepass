import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Node 20's test runner does not expand globs. Collect lib unit test files
 * ourselves so `npm test` works the same in CI (Node 20) and local (Node 22+).
 */
const root = fileURLToPath(new URL("..", import.meta.url))
const libDir = join(root, "lib")

function collectTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectTests(full, out)
      continue
    }
    if (entry.name.endsWith(".test.ts")) out.push(full)
  }
  return out
}

const files = collectTests(libDir).sort()
if (files.length === 0) {
  console.error("No unit tests found under lib/")
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", cwd: root, env: process.env },
)

process.exit(result.status ?? 1)
