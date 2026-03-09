import { Hono } from "hono"
import { execAsync } from "../utils/exec"

export const containerRoutes = new Hono()

const EXEGOL_IMAGE_PATTERNS = [
  "exegol",
  "nwodtuhs/exegol",
]

function isExegolImage(image: string): boolean {
  const lower = image.toLowerCase()
  return EXEGOL_IMAGE_PATTERNS.some((p) => lower.includes(p))
}

containerRoutes.get("/containers", async (c) => {
  try {
    const result = await execAsync(
      'docker ps -a --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.State}}\\t{{.Status}}\\t{{.Ports}}"',
    )
    const lines = result.stdout.trim().split("\n").filter(Boolean)
    const containers = lines
      .map((line) => {
        const [id, name, image, state, status, ports] = line.split("\t")
        return {
          id,
          name,
          image,
          state: state as "running" | "exited" | "paused" | "created",
          status,
          ports: ports ? ports.split(", ").filter(Boolean) : [],
        }
      })
      .filter((c) => isExegolImage(c.image))

    return c.json({ containers })
  } catch (e) {
    return c.json({ containers: [], error: (e as Error).message }, 500)
  }
})

containerRoutes.post("/containers/:name/start", async (c) => {
  const name = c.req.param("name")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    return c.json({ error: "Invalid container name" }, 400)
  }
  try {
    await execAsync(`docker start ${name}`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

containerRoutes.post("/containers/:name/stop", async (c) => {
  const name = c.req.param("name")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    return c.json({ error: "Invalid container name" }, 400)
  }
  try {
    await execAsync(`docker stop ${name}`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})
