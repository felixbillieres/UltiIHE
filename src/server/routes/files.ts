import { Hono } from "hono"
import { execAsync } from "../utils/exec"

export const filesRoutes = new Hono()

// ── Validation ──────────────────────────────────────────────────

function validateContainer(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
}

function validatePath(path: string): boolean {
  if (!path.startsWith("/")) return false
  if (path.includes("..")) return false
  if (path.includes("\0")) return false
  return /^\/[a-zA-Z0-9_./ -]*$/.test(path)
}

const PROTECTED_ROOTS = new Set([
  "/", "/bin", "/sbin", "/lib", "/lib64", "/usr", "/var",
  "/boot", "/dev", "/proc", "/sys",
])

// ── List directory ──────────────────────────────────────────────

filesRoutes.get("/files/:container/list", async (c) => {
  const container = c.req.param("container")
  const path = c.req.query("path") || "/"
  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
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
        return {
          name: fullPath.split("/").pop() || fullPath,
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

// ── Read file ───────────────────────────────────────────────────

filesRoutes.get("/files/:container/read", async (c) => {
  const container = c.req.param("container")
  const path = c.req.query("path")
  if (!container || !path) return c.json({ error: "Missing params" }, 400)
  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const sizeResult = await execAsync(`docker exec ${container} stat -c %s "${path}"`)
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

// ── Write file ──────────────────────────────────────────────────

filesRoutes.post("/files/:container/write", async (c) => {
  const container = c.req.param("container")
  const { path, content } = (await c.req.json()) as { path: string; content: string }

  if (!container || !path) return c.json({ error: "Missing params" }, 400)
  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)
  if (typeof content !== "string") return c.json({ error: "Content must be a string" }, 400)

  try {
    const proc = Bun.spawn(["docker", "exec", "-i", container, "tee", path], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
    })
    proc.stdin.write(content)
    proc.stdin.end()
    await proc.exited

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(stderr || `Exit code ${proc.exitCode}`)
    }
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Create file ─────────────────────────────────────────────────

filesRoutes.post("/files/:container/create-file", async (c) => {
  const container = c.req.param("container")
  const { path } = (await c.req.json()) as { path: string }

  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const dir = path.substring(0, path.lastIndexOf("/"))
    if (dir) await execAsync(`docker exec ${container} mkdir -p "${dir}"`)
    await execAsync(`docker exec ${container} touch "${path}"`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Create directory ────────────────────────────────────────────

filesRoutes.post("/files/:container/create-dir", async (c) => {
  const container = c.req.param("container")
  const { path } = (await c.req.json()) as { path: string }

  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    await execAsync(`docker exec ${container} mkdir -p "${path}"`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Delete ──────────────────────────────────────────────────────

filesRoutes.post("/files/:container/delete", async (c) => {
  const container = c.req.param("container")
  const { path } = (await c.req.json()) as { path: string }

  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)
  if (PROTECTED_ROOTS.has(path)) return c.json({ error: "Cannot delete protected path" }, 403)

  try {
    await execAsync(`docker exec ${container} rm -rf "${path}"`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Rename / move (same container) ──────────────────────────────

filesRoutes.post("/files/:container/rename", async (c) => {
  const container = c.req.param("container")
  const { oldPath, newPath } = (await c.req.json()) as { oldPath: string; newPath: string }

  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(oldPath) || !validatePath(newPath)) return c.json({ error: "Invalid path" }, 400)

  try {
    const dir = newPath.substring(0, newPath.lastIndexOf("/"))
    if (dir) await execAsync(`docker exec ${container} mkdir -p "${dir}"`)
    await execAsync(`docker exec ${container} mv "${oldPath}" "${newPath}"`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Transfer (cross-container copy/move) ────────────────────────

filesRoutes.post("/files/transfer", async (c) => {
  const { srcContainer, srcPath, dstContainer, dstPath, operation } = (await c.req.json()) as {
    srcContainer: string
    srcPath: string
    dstContainer: string
    dstPath: string
    operation: "copy" | "move"
  }

  if (!validateContainer(srcContainer) || !validateContainer(dstContainer))
    return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(srcPath) || !validatePath(dstPath))
    return c.json({ error: "Invalid path" }, 400)

  try {
    // Same container: use cp/mv directly
    if (srcContainer === dstContainer) {
      const dir = dstPath.substring(0, dstPath.lastIndexOf("/"))
      if (dir) await execAsync(`docker exec ${srcContainer} mkdir -p "${dir}"`)

      if (operation === "copy") {
        await execAsync(`docker exec ${srcContainer} cp -r "${srcPath}" "${dstPath}"`)
      } else {
        await execAsync(`docker exec ${srcContainer} mv "${srcPath}" "${dstPath}"`)
      }
      return c.json({ ok: true })
    }

    // Cross-container: check if file or dir
    const typeResult = await execAsync(
      `docker exec ${srcContainer} test -d "${srcPath}" && echo DIR || echo FILE`,
    )
    const isDir = typeResult.stdout.trim() === "DIR"

    const dstDir = dstPath.substring(0, dstPath.lastIndexOf("/"))
    if (dstDir) await execAsync(`docker exec ${dstContainer} mkdir -p "${dstDir}"`)

    if (isDir) {
      // Tar pipe for directories
      const srcParent = srcPath.substring(0, srcPath.lastIndexOf("/")) || "/"
      const srcName = srcPath.split("/").pop()!
      const dstParent = dstPath.substring(0, dstPath.lastIndexOf("/")) || "/"

      const tarRead = Bun.spawn(
        ["docker", "exec", srcContainer, "tar", "-cf", "-", "-C", srcParent, srcName],
        { stdout: "pipe", stderr: "pipe" },
      )
      const tarWrite = Bun.spawn(
        ["docker", "exec", "-i", dstContainer, "tar", "-xf", "-", "-C", dstParent],
        { stdin: tarRead.stdout, stdout: "pipe", stderr: "pipe" },
      )

      await tarWrite.exited
      if (tarWrite.exitCode !== 0) {
        const stderr = await new Response(tarWrite.stderr).text()
        throw new Error(stderr || "Transfer failed")
      }

      // Rename if destination name differs
      const dstName = dstPath.split("/").pop()!
      if (srcName !== dstName) {
        await execAsync(`docker exec ${dstContainer} mv "${dstParent}/${srcName}" "${dstPath}"`)
      }
    } else {
      // File: read then write via stdin
      const readProc = Bun.spawn(
        ["docker", "exec", srcContainer, "cat", srcPath],
        { stdout: "pipe", stderr: "pipe" },
      )
      const writeProc = Bun.spawn(
        ["docker", "exec", "-i", dstContainer, "tee", dstPath],
        { stdin: readProc.stdout, stdout: "pipe", stderr: "pipe" },
      )

      await writeProc.exited
      if (writeProc.exitCode !== 0) {
        const stderr = await new Response(writeProc.stderr).text()
        throw new Error(stderr || "Transfer failed")
      }
    }

    // Delete source if move
    if (operation === "move") {
      await execAsync(`docker exec ${srcContainer} rm -rf "${srcPath}"`)
    }

    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})
