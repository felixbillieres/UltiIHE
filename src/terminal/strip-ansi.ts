/**
 * Strips ANSI escape codes from a string.
 * Used to clean terminal output before storing in the ring buffer for AI context.
 */

// Matches all ANSI escape sequences:
// - CSI sequences: ESC [ ... final_byte
// - OSC sequences: ESC ] ... ST (string terminator)
// - Single-character escapes: ESC followed by a single char
// - Common control characters: BEL, BS, etc.
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]|[\u001b]\].*?(?:\u0007|\u001b\\)|[\u0007\u0008]/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "")
}
