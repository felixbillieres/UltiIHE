const MODELS_DEV_URL = "https://models.dev/api.json"
const OUTPUT_PATH = "./src/server/services/models-snapshot.ts"

async function main() {
  console.log("[snapshot] Fetching models.dev...")
  const res = await fetch(MODELS_DEV_URL, {
    headers: { "User-Agent": "ExegolIHE-build" },
  })
  if (!res.ok) {
    console.error(`[snapshot] Failed: HTTP ${res.status}`)
    process.exit(1)
  }
  const data = await res.json()
  const providerCount = Object.keys(data).length
  const modelCount = Object.values(data).reduce(
    (sum: number, p: any) => sum + Object.keys(p.models || {}).length,
    0,
  )

  const content = `// Auto-generated from models.dev — do not edit manually
// Last updated: ${new Date().toISOString()}
// ${providerCount} providers, ${modelCount} models
export const snapshot = ${JSON.stringify(data)} as const
`
  await Bun.write(OUTPUT_PATH, content)
  console.log(
    `[snapshot] Written ${providerCount} providers, ${modelCount} models`,
  )
}

main()
