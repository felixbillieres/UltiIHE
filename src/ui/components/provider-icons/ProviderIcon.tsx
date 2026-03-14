import type { SVGProps } from "react"
import { useMemo } from "react"
import spriteUrl from "./sprite.svg"
import { iconNames, type IconName } from "./types"

export type ProviderIconProps = SVGProps<SVGSVGElement> & {
  /** Provider ID — falls back to "synthetic" if not found in sprite */
  id: string
}

export function ProviderIcon({ id, ...rest }: ProviderIconProps) {
  const resolved = useMemo(
    () => (iconNames.includes(id as IconName) ? id : "synthetic"),
    [id],
  )
  return (
    <svg data-component="provider-icon" {...rest}>
      <use href={`${spriteUrl}#${resolved}`} />
    </svg>
  )
}
