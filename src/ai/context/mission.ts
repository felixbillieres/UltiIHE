/**
 * Mission state — auto-extracted from conversation history.
 *
 * Scans messages for IPs, ports, credentials, flags, and CVEs.
 * Serialized as a compact block injected into the system prompt
 * so the AI never loses track of findings even after pruning/compaction.
 */

export interface MissionState {
  targets: string[]
  ports: Array<{ target: string; port: string; service: string }>
  credentials: Array<{ user: string; pass: string; service: string }>
  flags: string[]
  cves: string[]
}

// ── Extraction patterns ──────────────────────────────────────

const IP_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g
const PORT_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})?[:\s]+(\d+)\/(tcp|udp)\s+(open)\s+(\S+)/g
const NMAP_PORT_RE = /^(\d+)\/(tcp|udp)\s+(open)\s+(\S+)/gm
const FLAG_RE = /flag\{[^}]+\}/gi
const CVE_RE = /CVE-\d{4}-\d+/gi
const CRED_PATTERNS = [
  // username:password or user/pass patterns
  /(?:password|passwd|pwd|pass)[:\s=]+["']?(\S+?)["']?(?:\s|$)/gi,
  /(?:login|user(?:name)?)[:\s=]+["']?(\S+?)["']?\s.*?(?:password|passwd|pwd|pass)[:\s=]+["']?(\S+?)["']?/gi,
  // exh_add_cred tool calls (structured)
  /exh_add_cred.*?username[:\s"]+(\S+?)["}\s].*?password[:\s"]+(\S+?)["}\s]/gi,
]

// Common false-positive IPs to exclude
const EXCLUDED_IPS = new Set(["0.0.0.0", "127.0.0.1", "255.255.255.255", "0.0.0.1"])

/**
 * Extract mission-relevant findings from conversation messages.
 * Deduplicates automatically.
 */
export function extractMissionState(
  messages: Array<{ role: string; content: string }>,
): MissionState {
  const targets = new Set<string>()
  const portMap = new Map<string, { target: string; port: string; service: string }>()
  const credMap = new Map<string, { user: string; pass: string; service: string }>()
  const flags = new Set<string>()
  const cves = new Set<string>()

  for (const msg of messages) {
    const text = msg.content
    if (!text) continue

    // Extract IPs (targets)
    for (const match of text.matchAll(IP_RE)) {
      const ip = match[1]
      if (!EXCLUDED_IPS.has(ip) && !ip.startsWith("10.0.0.") && ip !== "192.168.1.1") {
        targets.add(ip)
      }
    }

    // Extract ports (nmap format: 22/tcp open ssh)
    for (const match of text.matchAll(NMAP_PORT_RE)) {
      const port = match[1]
      const service = match[4] || "unknown"
      // Try to associate with a nearby IP
      const nearbyIp = text.match(IP_RE)?.[0] || "unknown"
      const key = `${nearbyIp}:${port}`
      if (!portMap.has(key)) {
        portMap.set(key, { target: nearbyIp, port, service })
      }
    }

    // Extract flags
    for (const match of text.matchAll(FLAG_RE)) {
      flags.add(match[0])
    }

    // Extract CVEs
    for (const match of text.matchAll(CVE_RE)) {
      cves.add(match[0])
    }

    // Extract credentials (heuristic)
    for (const pattern of CRED_PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (match[2]) {
          // user + pass pattern
          const key = `${match[1]}:${match[2]}`
          if (!credMap.has(key)) {
            credMap.set(key, { user: match[1], pass: match[2], service: "unknown" })
          }
        }
      }
    }
  }

  return {
    targets: [...targets].slice(0, 20),
    ports: [...portMap.values()].slice(0, 50),
    credentials: [...credMap.values()].slice(0, 20),
    flags: [...flags],
    cves: [...cves].slice(0, 20),
  }
}

/**
 * Serialize mission state to a compact prompt block.
 * Returns empty string if no findings.
 */
export function serializeMissionState(state: MissionState): string {
  const sections: string[] = []

  if (state.targets.length > 0) {
    sections.push(`Targets: ${state.targets.join(", ")}`)
  }
  if (state.ports.length > 0) {
    const portStrs = state.ports.map((p) => `${p.target}:${p.port}(${p.service})`)
    sections.push(`Open ports: ${portStrs.join(", ")}`)
  }
  if (state.credentials.length > 0) {
    const credStrs = state.credentials.map((c) => `${c.user}:${c.pass} (${c.service})`)
    sections.push(`Credentials: ${credStrs.join(", ")}`)
  }
  if (state.flags.length > 0) {
    sections.push(`Flags: ${state.flags.join(", ")}`)
  }
  if (state.cves.length > 0) {
    sections.push(`CVEs: ${state.cves.join(", ")}`)
  }

  if (sections.length === 0) return ""

  return `MISSION STATE (auto-extracted, always current):\n${sections.join("\n")}`
}
