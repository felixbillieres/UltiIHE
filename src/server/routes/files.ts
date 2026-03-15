import { Hono } from "hono"
import { readdir, stat, readFile, writeFile, mkdir, rm, rename as fsRename, cp } from "node:fs/promises"
import { join, resolve, basename, dirname } from "node:path"
import { isValidContainerName, validatePath, PROTECTED_ROOTS } from "../../shared/validation"
import { DOCKER_EXEC_TIMEOUT } from "../../config"

export const filesRoutes = new Hono()

// ── Docker exec helper (no shell interpolation, array args) ─────

async function dockerExec(
  container: string,
  args: string[],
  timeout = DOCKER_EXEC_TIMEOUT,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["docker", "exec", container, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const timer = setTimeout(() => proc.kill(), timeout)
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  clearTimeout(timer)
  await proc.exited

  return { stdout, stderr, exitCode: proc.exitCode ?? 1 }
}

// ── Validation (uses shared) ────────────────────────────────────

const validateContainer = isValidContainerName

function validateHostPath(path: string): boolean {
  if (!path.startsWith("/")) return false
  if (path.includes("..")) return false
  if (path.includes("\0")) return false
  const resolved = resolve(path)
  return resolved === path || resolved === path.replace(/\/+$/, "")
}

// ═══════════════════════════════════════════════════════════════════
// Host filesystem routes — MUST be registered BEFORE :container
// routes, otherwise Hono matches "host" as a container name.
// ═══════════════════════════════════════════════════════════════════

filesRoutes.get("/files/host/list", async (c) => {
  const path = c.req.query("path") || "/"
  if (!validateHostPath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const dirents = await readdir(path, { withFileTypes: true })
    const entries = await Promise.all(
      dirents.map(async (d) => {
        const fullPath = join(path, d.name)
        try {
          const s = await stat(fullPath)
          return {
            name: d.name,
            path: fullPath,
            type: d.isDirectory() ? "dir" : "file",
            size: s.size,
            modified: s.mtimeMs / 1000,
          }
        } catch {
          return { name: d.name, path: fullPath, type: d.isDirectory() ? "dir" : "file", size: 0, modified: 0 }
        }
      }),
    )
    return c.json({ entries })
  } catch (e) {
    return c.json({ entries: [], error: (e as Error).message }, 500)
  }
})

filesRoutes.get("/files/host/read", async (c) => {
  const path = c.req.query("path")
  if (!path) return c.json({ error: "Missing path" }, 400)
  if (!validateHostPath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const s = await stat(path)
    if (s.size > 5 * 1024 * 1024) return c.json({ error: "File too large (> 5MB)" }, 413)
    const content = await readFile(path, "utf-8")
    return c.json({ content, size: s.size })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

filesRoutes.post("/files/host/write", async (c) => {
  const { path: filePath, content } = (await c.req.json()) as { path: string; content: string }
  if (!filePath || !validateHostPath(filePath)) return c.json({ error: "Invalid path" }, 400)
  if (typeof content !== "string") return c.json({ error: "Content must be a string" }, 400)

  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, "utf-8")
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

filesRoutes.post("/files/host/create-file", async (c) => {
  const { path: filePath } = (await c.req.json()) as { path: string }
  if (!validateHostPath(filePath)) return c.json({ error: "Invalid path" }, 400)

  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, "", "utf-8")
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

filesRoutes.post("/files/host/create-dir", async (c) => {
  const { path: dirPath } = (await c.req.json()) as { path: string }
  if (!validateHostPath(dirPath)) return c.json({ error: "Invalid path" }, 400)

  try {
    await mkdir(dirPath, { recursive: true })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

filesRoutes.post("/files/host/delete", async (c) => {
  const { path: targetPath } = (await c.req.json()) as { path: string }
  if (!validateHostPath(targetPath)) return c.json({ error: "Invalid path" }, 400)
  if (PROTECTED_ROOTS.has(targetPath)) return c.json({ error: "Cannot delete protected path" }, 403)

  try {
    await rm(targetPath, { recursive: true, force: true })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

filesRoutes.post("/files/host/rename", async (c) => {
  const { oldPath, newPath } = (await c.req.json()) as { oldPath: string; newPath: string }
  if (!validateHostPath(oldPath) || !validateHostPath(newPath)) return c.json({ error: "Invalid path" }, 400)

  try {
    await mkdir(dirname(newPath), { recursive: true })
    await fsRename(oldPath, newPath)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// Container filesystem routes (docker exec)
// ═══════════════════════════════════════════════════════════════════

// ── List directory ──────────────────────────────────────────────

filesRoutes.get("/files/:container/list", async (c) => {
  const container = c.req.param("container")
  const path = c.req.query("path") || "/"
  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    const result = await dockerExec(container, [
      "find", path, "-maxdepth", "1", "-mindepth", "1", "-printf", "%y %s %T@ %p\\n",
    ])
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
    const sizeResult = await dockerExec(container, ["stat", "-c", "%s", path])
    const size = parseInt(sizeResult.stdout.trim())
    if (size > 5 * 1024 * 1024) {
      return c.json({ error: "File too large (> 5MB)" }, 413)
    }

    // Base64 mode for binary files (images dragged to chat)
    const base64 = c.req.query("base64")
    if (base64 === "true") {
      const result = await dockerExec(container, ["base64", "-w0", path])
      const ext = path.split(".").pop()?.toLowerCase() || ""
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
      }
      return c.json({ base64: result.stdout.trim(), mime: mimeMap[ext] || "application/octet-stream", size })
    }

    const result = await dockerExec(container, ["cat", path])
    return c.json({ content: result.stdout, size })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

// ── Write file ──────────────────────────────────────────────────

filesRoutes.post("/files/:container/write", async (c) => {
  const container = c.req.param("container")
  const body = (await c.req.json()) as { path: string; content?: string; contentBase64?: string; mkdir?: boolean }
  const { path, content, contentBase64, mkdir } = body

  if (!container || !path) return c.json({ error: "Missing params" }, 400)
  if (!validateContainer(container)) return c.json({ error: "Invalid container" }, 400)
  if (!validatePath(path)) return c.json({ error: "Invalid path" }, 400)

  try {
    // Ensure parent directory exists if requested
    if (mkdir) {
      const dir = path.substring(0, path.lastIndexOf("/"))
      if (dir) {
        const mkdirProc = Bun.spawn(["docker", "exec", container, "mkdir", "-p", dir], {
          stdout: "pipe", stderr: "pipe",
        })
        await mkdirProc.exited
      }
    }

    if (contentBase64) {
      // Binary write via base64 decode
      if (contentBase64.length > 15 * 1024 * 1024) return c.json({ error: "Content too large (> 10MB)" }, 413)
      const proc = Bun.spawn(["docker", "exec", "-i", container, "sh", "-c", `base64 -d > '${path.replace(/'/g, "'\\''")}'`], {
        stdin: "pipe", stdout: "pipe", stderr: "pipe",
      })
      proc.stdin.write(contentBase64)
      proc.stdin.end()
      await proc.exited

      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(stderr || `Exit code ${proc.exitCode}`)
      }
      return c.json({ ok: true })
    }

    // Text write
    if (typeof content !== "string") return c.json({ error: "Content must be a string" }, 400)
    if (content.length > 10 * 1024 * 1024) return c.json({ error: "Content too large (> 10MB)" }, 413)

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
    if (dir) await dockerExec(container, ["mkdir", "-p", dir])
    await dockerExec(container, ["touch", path])
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
    await dockerExec(container, ["mkdir", "-p", path])
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
    await dockerExec(container, ["rm", "-rf", path])
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
    if (dir) await dockerExec(container, ["mkdir", "-p", dir])
    await dockerExec(container, ["mv", oldPath, newPath])
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
      if (dir) await dockerExec(srcContainer, ["mkdir", "-p", dir])

      if (operation === "copy") {
        await dockerExec(srcContainer, ["cp", "-r", srcPath, dstPath])
      } else {
        await dockerExec(srcContainer, ["mv", srcPath, dstPath])
      }
      return c.json({ ok: true })
    }

    // Cross-container: check if file or dir
    const typeResult = await dockerExec(srcContainer, ["test", "-d", srcPath])
    const isDir = typeResult.exitCode === 0

    const dstDir = dstPath.substring(0, dstPath.lastIndexOf("/"))
    if (dstDir) await dockerExec(dstContainer, ["mkdir", "-p", dstDir])

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
        await dockerExec(dstContainer, ["mv", `${dstParent}/${srcName}`, dstPath])
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
      await dockerExec(srcContainer, ["rm", "-rf", srcPath])
    }

    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})
