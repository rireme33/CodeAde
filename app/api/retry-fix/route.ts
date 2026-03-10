import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'

const LATEST_VERIFY_RUN_PATH = path.join(process.cwd(), 'tmp', 'latest-verify-run.json')

type VerifyStepResult = {
  step: string
  command: string
  success: boolean
  output: string
}

type LatestVerifyRun = {
  ok?: boolean
  projectRoot?: string | null
  scanRoot?: string | null
  fileName?: string | null
  packageRoot?: string | null
  verificationPlan?: string[]
  steps?: VerifyStepResult[]
  executedCount?: number
  commandName?: string | null
  command?: string | null
  success?: boolean
  output?: string
  generatedAt?: string
}

function readLatestVerifyRun(): LatestVerifyRun | null {
  try {
    if (!fs.existsSync(LATEST_VERIFY_RUN_PATH)) {
      return null
    }

    const raw = fs.readFileSync(LATEST_VERIFY_RUN_PATH, 'utf8')
    return JSON.parse(raw) as LatestVerifyRun
  } catch {
    return null
  }
}

function extractFailedStep(data: LatestVerifyRun): VerifyStepResult | null {
  const steps = Array.isArray(data.steps) ? data.steps : []

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.success === false) {
      return steps[index]
    }
  }

  return null
}

export async function POST() {
  try {
    const verifyRun = readLatestVerifyRun()

    if (!verifyRun) {
      return NextResponse.json(
        { ok: false, message: 'latest verify-run result not found' },
        { status: 404 }
      )
    }

    if (verifyRun.success === true) {
      return NextResponse.json({
        ok: true,
        source: 'latest-verify-run.json',
        verifyRun,
        aiFixes: [],
        message: 'latest verify-run already succeeded'
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, message: 'OPENAI_API_KEY missing' },
        { status: 500 }
      )
    }

    const failedStep = extractFailedStep(verifyRun)
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const prompt = [
      'You are an AI code-fix generator for a Next.js SaaS called CodeAde.',
      'Your task is to propose safe file-level fixes based on a failed verification run.',
      'Return JSON only.',
      '',
      'Required JSON format:',
      '{',
      '  "aiFixes": [',
      '    {',
      '      "issueId": "string",',
      '      "title": "string",',
      '      "summary": "string",',
      '      "filePath": "string",',
      '      "action": "create-or-replace",',
      '      "content": "string"',
      '    }',
      '  ]',
      '}',
      '',
      'Rules:',
      '- Prefer minimal safe fixes.',
      '- Do not return markdown fences.',
      '- If you cannot identify a safe concrete file change, return {"aiFixes":[]}.',
      '',
      'Latest verify-run result:',
      JSON.stringify(
        {
          fileName: verifyRun.fileName ?? null,
          projectRoot: verifyRun.projectRoot ?? null,
          packageRoot: verifyRun.packageRoot ?? null,
          verificationPlan: verifyRun.verificationPlan ?? [],
          executedCount: verifyRun.executedCount ?? 0,
          failedStep,
          output: verifyRun.output ?? ''
        },
        null,
        2
      )
    ].join('\n')

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You generate strict JSON for file-level code fixes.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const raw = completion.choices[0]?.message?.content ?? '{"aiFixes":[]}'
    const parsed = JSON.parse(raw) as {
      aiFixes?: Array<{
        issueId?: string
        title?: string
        summary?: string
        filePath?: string
        action?: string
        content?: string
      }>
    }

    return NextResponse.json({
      ok: true,
      source: 'latest-verify-run.json',
      verifyRun,
      aiFixes: Array.isArray(parsed.aiFixes) ? parsed.aiFixes : []
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'retry-fix failed'
      },
      { status: 500 }
    )
  }
}
