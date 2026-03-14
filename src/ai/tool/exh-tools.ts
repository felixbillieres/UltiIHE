/**
 * AI tools for exegol-history integration.
 * Allows the AI to read and add credentials/hosts discovered during pentest.
 */

import { z } from "zod"
import type { Tool } from "ai"
import { dockerExec, shellEscape } from "./exec"

const EXH_CMD = "/opt/tools/Exegol-history/venv/bin/python3 /opt/tools/Exegol-history/exegol-history.py"

/**
 * Read credentials from exegol-history database.
 */
export const exhReadCredsTool: Tool<{ container: string }, string> = {
  description:
    "Read all stored credentials from exegol-history (exh) in the container. " +
    "Returns username, password, hash, and domain for each credential. " +
    "Use this to know what credentials are available before running commands.",
  inputSchema: z.object({
    container: z.string().describe("Container name"),
  }),
  execute: async ({ container }) => {
    const result = await dockerExec(container, `${EXH_CMD} export creds --json`, { timeout: 10_000 })
    if (result.exitCode !== 0) {
      return `Error reading credentials: ${result.stderr.trim()}`
    }
    const trimmed = result.stdout.trim()
    if (!trimmed || trimmed === "[]") return "No credentials stored."
    try {
      const creds = JSON.parse(trimmed)
      return `${creds.length} credential(s):\n${JSON.stringify(creds, null, 2)}`
    } catch {
      return `Raw output: ${trimmed}`
    }
  },
}

/**
 * Read hosts from exegol-history database.
 */
export const exhReadHostsTool: Tool<{ container: string }, string> = {
  description:
    "Read all stored hosts from exegol-history (exh) in the container. " +
    "Returns IP, hostname, and role (DC, WKS, MSSQL, etc.) for each host. " +
    "Use this to know what targets are available.",
  inputSchema: z.object({
    container: z.string().describe("Container name"),
  }),
  execute: async ({ container }) => {
    const result = await dockerExec(container, `${EXH_CMD} export hosts --json`, { timeout: 10_000 })
    if (result.exitCode !== 0) {
      return `Error reading hosts: ${result.stderr.trim()}`
    }
    const trimmed = result.stdout.trim()
    if (!trimmed || trimmed === "[]") return "No hosts stored."
    try {
      const hosts = JSON.parse(trimmed)
      return `${hosts.length} host(s):\n${JSON.stringify(hosts, null, 2)}`
    } catch {
      return `Raw output: ${trimmed}`
    }
  },
}

/**
 * Read current environment variables set by exh.
 */
export const exhReadEnvTool: Tool<{ container: string }, string> = {
  description:
    "Show the exegol-history environment variables currently active in the shell. " +
    "These are $USER, $PASSWORD, $NT_HASH, $DOMAIN, $IP, $TARGET, $DC_HOST, etc. " +
    "The Exegol preset commands use these variables.",
  inputSchema: z.object({
    container: z.string().describe("Container name"),
  }),
  execute: async ({ container }) => {
    const result = await dockerExec(container, `${EXH_CMD} show`, { timeout: 10_000 })
    if (result.exitCode !== 0) {
      return `Error: ${result.stderr.trim()}`
    }
    return result.stdout.trim() || "No environment variables set."
  },
}

/**
 * Add a credential to exegol-history.
 */
export const exhAddCredTool: Tool<
  { container: string; username: string; password: string; hash: string; domain: string },
  string
> = {
  description:
    "Add a discovered credential to exegol-history (exh). " +
    "Use this when you find credentials in tool output (secretsdump, hashcat cracks, etc.). " +
    "At least one of username, password, or hash must be provided.",
  inputSchema: z.object({
    container: z.string().describe("Container name"),
    username: z.string().default("").describe("Username"),
    password: z.string().default("").describe("Cleartext password"),
    hash: z.string().default("").describe("NTLM or other hash"),
    domain: z.string().default("").describe("Domain (e.g., corp.local)"),
  }),
  execute: async ({ container, username, password, hash, domain }) => {
    if (!username && !password && !hash) {
      return "Error: at least one of username, password, or hash must be provided."
    }
    const args: string[] = [EXH_CMD, "add", "creds"]
    if (username) args.push("-u", shellEscape(username))
    if (password) args.push("-p", shellEscape(password))
    if (hash) args.push("-H", shellEscape(hash))
    if (domain) args.push("-d", shellEscape(domain))

    const result = await dockerExec(container, args.join(" "), { timeout: 10_000 })
    if (result.exitCode !== 0) {
      return `Failed to add credential: ${result.stderr.trim()}`
    }
    return `Credential added: ${username || ""}${domain ? `@${domain}` : ""}`
  },
}

/**
 * Add a host to exegol-history.
 */
export const exhAddHostTool: Tool<
  { container: string; ip: string; hostname: string; role: string },
  string
> = {
  description:
    "Add a discovered host to exegol-history (exh). " +
    "Use this when you discover hosts during recon (nmap, enum4linux, etc.). " +
    "At least one of ip or hostname must be provided.",
  inputSchema: z.object({
    container: z.string().describe("Container name"),
    ip: z.string().default("").describe("IP address"),
    hostname: z.string().default("").describe("NetBIOS or DNS hostname"),
    role: z.string().default("").describe("Role: DC, WKS, SCCM, ADCS, MSSQL, etc."),
  }),
  execute: async ({ container, ip, hostname, role }) => {
    if (!ip && !hostname) {
      return "Error: at least one of ip or hostname must be provided."
    }
    const args: string[] = [EXH_CMD, "add", "hosts"]
    if (ip) args.push("--ip", shellEscape(ip))
    if (hostname) args.push("-n", shellEscape(hostname))
    if (role) args.push("-r", shellEscape(role))

    const result = await dockerExec(container, args.join(" "), { timeout: 10_000 })
    if (result.exitCode !== 0) {
      return `Failed to add host: ${result.stderr.trim()}`
    }
    return `Host added: ${ip || ""}${hostname ? ` (${hostname})` : ""}${role ? ` [${role}]` : ""}`
  },
}
