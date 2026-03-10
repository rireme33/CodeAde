import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const RUN_CONTEXT_PATH = path.join(process.cwd(), "tmp", "run-context.json")
const LATEST_VERIFY_RUN_PATH = path.join(process.cwd(), "tmp", "latest-verify-run.json")

type SavedRunContext = {
  projectRoot?: string
  scanRoot?: string
  fileName?: string
}

type VerifyRunRequestBody = {
  projectRoot?: string
  scanRoot?: string
  fileName?: string
}

type VerifyStepResult = {
  step: string
  command: string
  success: boolean
  output: string
}

function readRunContext(): SavedRunContext | null {
  try {
    if (!fs.existsSync(RUN_CONTEXT_PATH)) {
      return null
    }

    const raw = fs.readFileSync(RUN_CONTEXT_PATH, "utf8")
    return JSON.parse(raw) as SavedRunContext
  } catch {
    return null
  }
}

function findPackageRoot(projectRoot: string): string | null {
  const direct = path.join(projectRoot, "package.json")

  if (fs.existsSync(direct)) {
    return projectRoot
  }

  const entries = fs.readdirSync(projectRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const nestedDir = path.join(projectRoot, entry.name)
    const nestedPackageJson = path.join(nestedDir, "package.json")

    if (fs.existsSync(nestedPackageJson)) {
      return nestedDir
    }
  }

  return null
}

function readPackageScripts(packageRoot: string): string[] {
  const packageJsonPath = path.join(packageRoot, "package.json")

  if (!fs.existsSync(packageJsonPath)) {
    return []
  }

  const raw = fs.readFileSync(packageJsonPath, "utf8")
  const parsed = JSON.parse(raw) as {
    scripts?: Record<string, string>
  }

  return Object.keys(parsed.scripts ?? {})
}

function buildVerificationPlan(packageRoot: string): string[] {
  const scriptNames = readPackageScripts(packageRoot)
  const plan: string[] = ["install"]

  if (scriptNames.includes("build")) {
    plan.push("build")
  }

  if (scriptNames.includes("lint")) {
    plan.push("lint")
  }

  if (scriptNames.includes("test")) {
    plan.push("test")
  }

  return plan
}

function commandFromStep(step: string): string {
  switch (step) {
    case "install":
      return "npm install"
    case "build":
      return "npm run build"
    case "lint":
      return "npm run lint"
    case "test":
      return "npm run test"
    default:
      throw new Error(`unsupported step: ${step}`)
  }
}

function runStep(packageRoot: string, step: string): VerifyStepResult {
  const command = commandFromStep(step)

  try {
    const output = execSync(command, {
      cwd: packageRoot,
      stdio: "pipe"
    }).toString()

    return {
      step,
      command,
      success: true,
      output
    }
  } catch (err: any) {
    const stdout = err?.stdout?.toString?.() ?? ""
    const stderr = err?.stderr?.toString?.() ?? ""
    const output = [stdout, stderr].filter(Boolean).join("\n")

    return {
      step,
      command,
      success: false,
      output
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: VerifyRunRequestBody = {}

    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const savedRunContext = readRunContext()

    const effectiveRunContext: SavedRunContext = {
      projectRoot:
        typeof body.projectRoot === "string" && body.projectRoot.trim()
          ? body.projectRoot.trim()
          : savedRunContext?.projectRoot,
      scanRoot:
        typeof body.scanRoot === "string" && body.scanRoot.trim()
          ? body.scanRoot.trim()
          : savedRunContext?.scanRoot,
      fileName:
        typeof body.fileName === "string" && body.fileName.trim()
          ? body.fileName.trim()
          : savedRunContext?.fileName
    }

    if (!effectiveRunContext.projectRoot) {
      return NextResponse.json(
        { ok: false, message: "projectRoot missing" },
        { status: 400 }
      )
    }

    let packageRoot = findPackageRoot(effectiveRunContext.projectRoot)

    if (!packageRoot) {
      packageRoot = effectiveRunContext.projectRoot
    }

    const verificationPlan = buildVerificationPlan(packageRoot)
    const steps: VerifyStepResult[] = []

    for (const step of verificationPlan) {
      const result = runStep(packageRoot, step)
      steps.push(result)

      if (!result.success) {
        break
      }
    }

    const executedCount = steps.length
    const lastStep = steps[steps.length - 1]

    const responseBody = {
      ok: true,
      projectRoot: effectiveRunContext.projectRoot ?? null,
      scanRoot: effectiveRunContext.scanRoot ?? null,
      fileName: effectiveRunContext.fileName ?? null,
      packageRoot,
      verificationPlan,
      steps,
      executedCount,
      commandName: lastStep?.step ?? null,
      command: lastStep?.command ?? null,
      success: lastStep?.success ?? true,
      output: lastStep?.output ?? ""
    }

    fs.mkdirSync(path.dirname(LATEST_VERIFY_RUN_PATH), { recursive: true })
    fs.writeFileSync(
      LATEST_VERIFY_RUN_PATH,
      JSON.stringify(responseBody, null, 2),
      "utf8"
    )

    return NextResponse.json(responseBody)
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "verify-run failed"
      },
      { status: 500 }
    )
  }
}
