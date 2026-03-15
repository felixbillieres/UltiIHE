/**
 * Docker exec helper for running commands in Exegol containers.
 * Used internally by file, search, and other container-scoped tools.
 */

import { isValidContainerName } from "../../shared/validation"
import { DOCKER_EXEC_MAX_OUTPUT, DOCKER_EXEC_TIMEOUT } from "../../config"

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function dockerExec(
  container: string,
  command: string,
  options: { timeout?: number; stdin?: string; maxOutput?: number } = {},
): Promise<ExecResult> {
  if (!isValidContainerName(container)) {
    throw new Error(`Invalid container name: ${container}`)
  }

  const { timeout = DOCKER_EXEC_TIMEOUT, stdin, maxOutput = DOCKER_EXEC_MAX_OUTPUT } = options

  const args = stdin
    ? ["docker", "exec", "-i", container, "sh", "-c", command]
    : ["docker", "exec", container, "sh", "-c", command]

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin ? "pipe" : undefined,
  })

  if (stdin && proc.stdin) {
    proc.stdin.write(stdin)
    proc.stdin.end()
  }

  const timer = setTimeout(() => proc.kill(), timeout)

  const [stdoutRaw, stderrRaw, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  clearTimeout(timer)

  return {
    stdout:
      stdoutRaw.length > maxOutput
        ? stdoutRaw.slice(0, maxOutput) + `\n\n[truncated — exceeded ${maxOutput} bytes]`
        : stdoutRaw,
    stderr:
      stderrRaw.length > maxOutput
        ? stderrRaw.slice(0, maxOutput) + "\n\n[truncated]"
        : stderrRaw,
    exitCode,
  }
}

/**
 * Escape a file path for shell single-quote wrapping.
 */
export function shellEscape(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`
}
