import fs from 'node:fs/promises'
import path from 'node:path'

export type RunContext = {
  projectRoot: string
  scanRoot?: string
  fileName?: string
  updatedAt: string
}

const RUN_CONTEXT_PATH = path.join(process.cwd(), 'tmp', 'run-context.json')

export async function saveRunContext(input: Omit<RunContext, 'updatedAt'>): Promise<RunContext> {
  const payload: RunContext = {
    ...input,
    updatedAt: new Date().toISOString(),
  }

  await fs.mkdir(path.dirname(RUN_CONTEXT_PATH), { recursive: true })
  await fs.writeFile(RUN_CONTEXT_PATH, JSON.stringify(payload, null, 2), 'utf8')

  return payload
}
