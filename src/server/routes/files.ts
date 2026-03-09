import { Hono } from "hono"
import { execAsync } from "../utils/exec"

export const filesRoutes = new Hono()

function validateContainerName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
}

function validatePath(path: string): boolean {
  if (!path.startsWith("/")) return false
  if (path.includes("..")) return false
  if (path.includes("\0")) return false
  return /^\/[a-zA-Z0-9_./ -]*$/.test(path)
}

filesRoutes.get("/files/:container/list", async (c) => {
  const container = c.req.param("container")
  const path = c.req.query("path") || "/"
  if (!validateContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const result = await execAsync(
      `docker exec ${container} find "${path}" -maxdepth 1 -mindepth 1 -printf "%y %s %T@ %p\\n" 2>/dev/null | sort -k1,1r -k4`,
    )
    const entries = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\w) (\d+) ([\d.]+) (.+)$/)
        if (!match) return null
        const [, type, size, mtime, fullPath] = match
        const name = fullPath.split("/").pop() || fullPath
        return {
          name,
          path: fullPath,
          type: type === "d" ? "dir" : "file",
          size: parseInt(size),
          modified: parseFloat(mtime),
        }
      })
      .filter(Boolean)

    return c.json({ entries })
  } catch (e) {
    return c.json({ entries: [], error: (e as Error).message }, 500)
  }
})

filesRoutes.get("/files/:container/read", async (c) => {
  const container = c.req.param("container")
  const path = c.req.query("path")
  if (!container || !path) return c.json({ error: "Missing params" }, 400)
  if (!validateContainerName(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const sizeResult = await execAsync(
      `docker exec ${container} stat -c %s "${path}"`,
    )
    const size = parseInt(sizeResult.stdout.trim())
    if (size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large (> 5MB)" }, 413)
    }

    const result = await execAsync(`docker exec ${container} cat "${path}"`)
    return c.json({ content: result.stdout, size })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})
