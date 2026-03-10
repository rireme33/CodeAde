import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const RUN_CONTEXT_PATH = path.join(process.cwd(), 'tmp', 'run-context.json')

type SavedRunContext = {
  projectRoot?: string
}

type PackageJsonShape = {
  scripts?: Record<string, string>
}

function readSavedProjectRoot(): string | null {
  try {
    if (!fs.existsSync(RUN_CONTEXT_PATH)) {
      return null
    }

    const raw = fs.readFileSync(RUN_CONTEXT_PATH, 'utf8')
    const parsed = JSON.parse(raw) as SavedRunContext

    if (typeof parsed.projectRoot !== 'string' || !parsed.projectRoot.trim()) {
      return null
    }

    return parsed.projectRoot.trim()
  } catch {
    return null
  }
}

function findPackageJsonPath(projectRoot: string): string | null {
  const directPath = path.join(projectRoot, 'package.json')

  if (fs.existsSync(directPath)) {
    return directPath
  }

  const entries = fs.readdirSync(projectRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const nestedPath = path.join(projectRoot, entry.name, 'package.json')

    if (fs.existsSync(nestedPath)) {
      return nestedPath
    }
  }

  return null
}

function buildVerificationPlan(scripts: Record<string, string>) {
  const plan: Array<{ name: string; command: string }> = []

  if (typeof scripts.build === 'string' && scripts.build.trim()) {
    plan.push({ name: 'build', command: 'npm run build' })
  }

  if (typeof scripts.lint === 'string' && scripts.lint.trim()) {
    plan.push({ name: 'lint', command: 'npm run lint' })
  }

  if (typeof scripts.test === 'string' && scripts.test.trim()) {
    plan.push({ name: 'test', command: 'npm run test' })
  }

  return plan
}

export async function GET() {
  try {
    const projectRoot = readSavedProjectRoot()

    if (!projectRoot) {
      return NextResponse.json(
        {
          ok: false,
          message: 'projectRoot not found in run-context'
        },
        { status: 400 }
      )
    }

    const packageJsonPath = findPackageJsonPath(projectRoot)

    if (!packageJsonPath) {
      return NextResponse.json(
        {
          ok: false,
          message: 'package.json not found',
          projectRoot
        },
        { status: 404 }
      )
    }

    const packageRoot = path.dirname(packageJsonPath)
    const raw = fs.readFileSync(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as PackageJsonShape
    const scripts = parsed.scripts ?? {}
    const verificationPlan = buildVerificationPlan(scripts)

    return NextResponse.json({
      ok: true,
      projectRoot,
      packageRoot,
      packageJsonPath,
      scriptNames: Object.keys(scripts),
      scripts,
      verificationPlan
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'verify route failed'
      },
      { status: 500 }
    )
  }
}
