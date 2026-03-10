import { exec } from "child_process"
import { promisify } from "util"

const execPromise = promisify(exec)

export async function execAsync(
  command: string,
  timeout = 30000,
): Promise<{ stdout: string; stderr: string }> {
  return execPromise(command, {
    timeout,
    maxBuffer: 1024 * 1024 * 5,
    encoding: "utf-8",
  })
}
