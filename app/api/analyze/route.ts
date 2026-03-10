import { saveRunContext } from '../../../lib/server/run-context'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import OpenAI from 'openai'
import { spawnSync } from 'child_process'

type RepoSummary = {
  hasPackageJson: boolean
  hasTsconfig: boolean
  hasSchemaSql: boolean
  hasSrcIndexTs: boolean
  packageName: string
  scriptNames: string[]
  wranglerPath: string
  wranglerMain: string
  wranglerPreview: string
  entryFile: string
  srcIndexPreview: string
  runtime: string
  runtimeReason: string
  framework: string
  frameworkReason: string
  platform: string
  platformReason: string
  database: string
  databaseReason: string
}

type AnalyzeIssue = {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  reason: string
  fix: string
  filePath: string
  evidence: string
  codeSnippet: string
}

type AiFixResponse = {
  summary?: string
  patchTarget?: string
  patchExample?: string
  warnings?: string[]
}

type AiFixItem = {
  issueId: string
  response: string
}

type ReadyToApplyItem = {
  issueId: string
  filePath: string
  patchTarget: string
  summary: string
  patchExample: string
  warnings: string[]
}

type ExtractInfo = {
  has7z: boolean
  sevenZExtracted: boolean
  scanRoot: string
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function listImmediateEntries(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => {
      return entry.isDirectory() ? `[dir] ${entry.name}` : `[file] ${entry.name}`
    })
  } catch {
    return []
  }
}

function listAllFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const results: string[] = []

  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === 'build'
        ) {
          continue
        }

        walk(fullPath)
      } else {
        results.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return results
}

function toRelativePath(rootDir: string, fullPath: string): string {
  return path.relative(rootDir, fullPath)
}

function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()

  return [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
    '.jsonc',
    '.sql',
    '.md',
    '.toml',
    '.yml',
    '.yaml'
  ].includes(ext)
}

function findFileByName(rootDir: string, fileName: string): string {
  const allFiles = listAllFiles(rootDir)
  const match = allFiles.find((filePath) => path.basename(filePath).toLowerCase() === fileName.toLowerCase())
  return match ?? ''
}

function find7zExecutable(): string {
  const candidates = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    '7z'
  ]

  for (const candidate of candidates) {
    if (candidate === '7z') {
      return candidate
    }

    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return '7z'
}

function extractArchiveWith7z(archivePath: string, outDir: string): boolean {
  const sevenZPath = find7zExecutable()
  ensureDir(outDir)

  const result = spawnSync(sevenZPath, ['x', archivePath, `-o${outDir}`, '-y'], {
    encoding: 'utf8',
    shell: sevenZPath === '7z'
  })

  return result.status === 0 && listAllFiles(outDir).length > 0
}

function resolveNestedArchiveScanRoot(scanRoot: string): string {
  let currentRoot = scanRoot

  for (let depth = 0; depth < 3; depth += 1) {
    const entries = fs.existsSync(currentRoot)
      ? fs.readdirSync(currentRoot, { withFileTypes: true })
      : []

    if (entries.length !== 1) {
      return currentRoot
    }

    const onlyEntry = entries[0]
    const onlyPath = path.join(currentRoot, onlyEntry.name)

    if (onlyEntry.isDirectory()) {
      currentRoot = onlyPath
      continue
    }

    const ext = path.extname(onlyEntry.name).toLowerCase()
    if (ext !== '.7z' && ext !== '.zip') {
      return currentRoot
    }

    const nestedOutDir = path.join(currentRoot, `_nested_${depth}`)
    const ok = extractArchiveWith7z(onlyPath, nestedOutDir)

    if (!ok) {
      return currentRoot
    }

    currentRoot = nestedOutDir
  }

  return currentRoot
}

function extractZipWithFallback(zipPath: string, extractRoot: string): ExtractInfo {
  const zipExtractRoot = extractRoot

  try {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(zipExtractRoot, true)
  } catch {
  }

  const initialFiles = listAllFiles(zipExtractRoot)
  if (initialFiles.length > 1) {
    return {
      has7z: true,
      sevenZExtracted: false,
      scanRoot: resolveNestedArchiveScanRoot(zipExtractRoot)
    }
  }

  const sevenZExtractRoot = path.join(extractRoot, '_7z_extracted')
  const sevenZWorked = extractArchiveWith7z(zipPath, sevenZExtractRoot)

  if (sevenZWorked) {
    return {
      has7z: true,
      sevenZExtracted: true,
      scanRoot: resolveNestedArchiveScanRoot(sevenZExtractRoot)
    }
  }

  return {
    has7z: true,
    sevenZExtracted: false,
    scanRoot: resolveNestedArchiveScanRoot(zipExtractRoot)
  }
}

function scoreDirectory(dirPath: string): number {
  const packageJson = path.join(dirPath, 'package.json')
  const tsconfig = path.join(dirPath, 'tsconfig.json')
  const wranglerJsonc = path.join(dirPath, 'wrangler.jsonc')
  const wranglerToml = path.join(dirPath, 'wrangler.toml')
  const srcIndexTs = path.join(dirPath, 'src', 'index.ts')
  const schemaSql = path.join(dirPath, 'schema.sql')

  let score = 0

  if (fs.existsSync(packageJson)) score += 5
  if (fs.existsSync(tsconfig)) score += 3
  if (fs.existsSync(wranglerJsonc) || fs.existsSync(wranglerToml)) score += 4
  if (fs.existsSync(srcIndexTs)) score += 3
  if (fs.existsSync(schemaSql)) score += 2

  return score
}

function adjustProjectRoot(candidateRoot: string, scanRoot: string): string {
  const candidateSrcIndex = path.join(candidateRoot, 'src', 'index.ts')
  if (fs.existsSync(candidateSrcIndex)) {
    return candidateRoot
  }

  const parentDir = path.dirname(candidateRoot)
  const scanRootNormalized = path.resolve(scanRoot)
  const parentNormalized = path.resolve(parentDir)

  if (!parentNormalized.startsWith(scanRootNormalized)) {
    return candidateRoot
  }

  const parentSrcIndex = path.join(parentDir, 'src', 'index.ts')
  if (fs.existsSync(parentSrcIndex)) {
    return parentDir
  }

  return candidateRoot
}

function detectProjectRoot(extractRoot: string): string {
  const allDirs: string[] = []

  function walkDirs(currentPath: string) {
    allDirs.push(currentPath)

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') {
        continue
      }

      walkDirs(path.join(currentPath, entry.name))
    }
  }

  walkDirs(extractRoot)

  const scored = allDirs.map((dirPath) => {
    return { dirPath, score: scoreDirectory(dirPath) }
  })

  scored.sort((a, b) => b.score - a.score)

  if ((scored[0]?.score ?? 0) > 0) {
    return adjustProjectRoot(scored[0].dirPath, extractRoot)
  }

  const allFiles = listAllFiles(extractRoot)
  const firstCodeFile = allFiles.find(isCodeFile)
  if (firstCodeFile) {
    return path.dirname(firstCodeFile)
  }

  return extractRoot
}

function summarizeRepo(projectRoot: string): RepoSummary {
  const packageJsonPath = findFileByName(projectRoot, 'package.json')
  const tsconfigPath = findFileByName(projectRoot, 'tsconfig.json')
  const schemaSqlPath = findFileByName(projectRoot, 'schema.sql')
  const srcIndexTsPath = findFileByName(projectRoot, 'index.ts')
  const wranglerJsoncPath = findFileByName(projectRoot, 'wrangler.jsonc')
  const wranglerTomlPath = findFileByName(projectRoot, 'wrangler.toml')
  const wranglerPath = wranglerJsoncPath || wranglerTomlPath

  let packageName = ''
  let scriptNames: string[] = []

  if (packageJsonPath) {
    try {
      const packageJson = JSON.parse(safeReadFile(packageJsonPath))
      packageName = typeof packageJson.name === 'string' ? packageJson.name : ''
      scriptNames = packageJson.scripts ? Object.keys(packageJson.scripts) : []
    } catch {
      packageName = ''
      scriptNames = []
    }
  }

  const wranglerContent = wranglerPath ? safeReadFile(wranglerPath) : ''
  const srcIndexContent = srcIndexTsPath ? safeReadFile(srcIndexTsPath) : ''

  let runtime = 'unknown'
  let runtimeReason = 'No clear runtime indicators found'

  if (tsconfigPath || srcIndexTsPath || packageJsonPath) {
    runtime = 'typescript'
    runtimeReason = 'tsconfig.json or TypeScript entry/dependency detected'
  }

  let framework = 'unknown'
  let frameworkReason = 'No clear framework indicators found'

  if (wranglerPath || srcIndexContent.includes('fetch(') || srcIndexContent.includes('fetch(request')) {
    framework = 'worker'
    frameworkReason = 'wrangler or worker-like fetch handler detected'
  }

  let platform = 'unknown'
  let platformReason = 'No clear platform indicators found'

  if (wranglerPath) {
    platform = 'cloudflare-workers'
    platformReason = 'wrangler config detected'
  }

  let database = 'unknown'
  let databaseReason = 'No clear database indicators found'

  if (wranglerContent.includes('d1_databases')) {
    database = 'd1/sqlite'
    databaseReason = 'd1_databases found in wrangler config'
  }

  return {
    hasPackageJson: Boolean(packageJsonPath),
    hasTsconfig: Boolean(tsconfigPath),
    hasSchemaSql: Boolean(schemaSqlPath),
    hasSrcIndexTs: Boolean(srcIndexTsPath),
    packageName,
    scriptNames,
    wranglerPath: wranglerPath ? path.basename(wranglerPath) : '',
    wranglerMain: wranglerContent.match(/"main"\s*:\s*"([^"]+)"/)?.[1] ?? '',
    wranglerPreview: wranglerContent.slice(0, 500),
    entryFile: srcIndexTsPath ? toRelativePath(projectRoot, srcIndexTsPath) : '',
    srcIndexPreview: srcIndexContent.slice(0, 350),
    runtime,
    runtimeReason,
    framework,
    frameworkReason,
    platform,
    platformReason,
    database,
    databaseReason
  }
}

function detectIssues(projectRoot: string, summary: RepoSummary): AnalyzeIssue[] {
  const issues: AnalyzeIssue[] = []

  if (summary.hasPackageJson) {
    const usefulScripts = ['dev', 'start', 'build', 'deploy']
    const missingScripts = usefulScripts.filter((name) => !summary.scriptNames.includes(name))

    if (missingScripts.length > 0) {
      issues.push({
        id: 'missing-useful-npm-scripts',
        severity: 'warning',
        title: 'Missing useful npm scripts',
        reason: 'package.json exists, but common execution scripts such as dev, start, build, or deploy were not found.',
        fix: 'Add scripts like dev, build, or deploy to package.json so the project can be run and verified more easily.',
        filePath: 'package.json',
        evidence: 'package.json scripts do not include dev, start, build, or deploy',
        codeSnippet: '"scripts": { "test": "..." }'
      })
    }
  }

  const readmePath = path.join(projectRoot, 'README.md')
  if (!fs.existsSync(readmePath)) {
    issues.push({
      id: 'missing-readme',
      severity: 'info',
      title: 'Missing README',
      reason: 'README.md was not found in the project root, so setup steps and project purpose are harder to understand.',
      fix: 'Add a README.md with project overview, setup steps, run commands, and deployment notes.',
      filePath: 'README.md',
      evidence: 'README.md not found in project root',
      codeSnippet: 'README.md file is missing in project root'
    })
  }

  if (
    summary.wranglerPath &&
    summary.srcIndexPreview.includes('DISCORD_WEBHOOK_URL') &&
    !summary.wranglerPreview.includes('DISCORD_WEBHOOK_URL')
  ) {
    issues.push({
      id: 'missing-env-binding-discord-webhook-url',
      severity: 'warning',
      title: 'Missing env binding for DISCORD_WEBHOOK_URL',
      reason: 'The code references DISCORD_WEBHOOK_URL, but that binding was not found in the detected Wrangler config preview.',
      fix: 'Add DISCORD_WEBHOOK_URL to Wrangler vars or secrets so the Worker can access the webhook at runtime.',
      filePath: summary.wranglerPath,
      evidence: 'DISCORD_WEBHOOK_URL referenced in srcindex.ts but not found in wrangler config',
      codeSnippet: 'DISCORD_WEBHOOK_URL: string;'
    })
  }

  return issues
}

function normalizePathValue(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replaceAll('\\', '/')
}

function pathMatchesDetectedTarget(target: string, detectedFileSet: Set<string>): boolean {
  if (!target) {
    return false
  }

  if (detectedFileSet.has(target)) {
    return true
  }

  for (const detected of detectedFileSet) {
    if (detected === target || detected.endsWith(`/${target}`)) {
      return true
    }
  }

  return false
}

function extractComparablePatchTarget(value: string | undefined, fallbackFilePath?: string): string {
  const raw = (value ?? '').trim()
  const fallback = normalizePathValue(fallbackFilePath)

  if (!raw) {
    return fallback
  }

  const normalizedRaw = normalizePathValue(raw)

  if (
    fallback &&
    (normalizedRaw.includes('package.json') || normalizedRaw.includes('wrangler.jsonc') || normalizedRaw.includes('readme.md'))
  ) {
    return fallback
  }

  const filenameMatches = raw.match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g)

  if (filenameMatches && filenameMatches.length > 0) {
    const extracted = normalizePathValue(filenameMatches[filenameMatches.length - 1])

    if (
      fallback &&
      (extracted.includes('package.json') || extracted.includes('wrangler.jsonc') || extracted.includes('readme.md'))
    ) {
      return fallback
    }

    return extracted
  }

  return fallback || normalizedRaw
}

function looksLikeNewFileSuggestion(issue: AnalyzeIssue | undefined, comparablePatchTarget: string): boolean {
  if (!issue) {
    return false
  }

  const title = issue.title.toLowerCase()
  const evidence = issue.evidence.toLowerCase()
  const codeSnippet = issue.codeSnippet.toLowerCase()

  if (title.includes('missing readme') && normalizePathValue(issue.filePath) === 'readme.md') {
    return true
  }

  if (
    evidence.includes('readme.md not found in project root') &&
    codeSnippet.includes('readme.md file is missing') &&
    normalizePathValue(issue.filePath) === 'readme.md'
  ) {
    return true
  }

  if (comparablePatchTarget === 'readme.md') {
    return true
  }

  return false
}

function cleanupJsonFence(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
      .replace(/\s*```$/, '')
      .trim()
  }

  return trimmed
}

function parseAiFixResponse(raw: string): AiFixResponse | null {
  try {
    const cleaned = cleanupJsonFence(raw)
    const parsed = JSON.parse(cleaned)

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      patchTarget: typeof parsed.patchTarget === 'string' ? parsed.patchTarget : '',
      patchExample: typeof parsed.patchExample === 'string' ? parsed.patchExample : '',
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((item): item is string => typeof item === 'string')
        : []
    }
  } catch {
    return null
  }
}

function buildReadyToApply(
  aiFixes: AiFixItem[],
  issues: AnalyzeIssue[],
  detectedFiles: string[]
): ReadyToApplyItem[] {
  const detectedFileSet = new Set(detectedFiles.map((filePath) => normalizePathValue(filePath)))

  return aiFixes.flatMap((aiFix) => {
    const parsed = parseAiFixResponse(aiFix.response)
    if (!parsed) {
      return []
    }

    const issue = issues.find((item) => item.id === aiFix.issueId)
    const normalizedFilePath = normalizePathValue(issue?.filePath)
    const extractedPatchTarget = extractComparablePatchTarget(parsed.patchTarget, issue?.filePath)
    const isNewFileSuggestion = looksLikeNewFileSuggestion(issue, extractedPatchTarget)

    const comparablePatchTarget =
      isNewFileSuggestion && normalizedFilePath.length > 0
        ? normalizedFilePath
        : extractedPatchTarget

    const hasTargetMismatch =
      normalizedFilePath.length > 0 &&
      comparablePatchTarget.length > 0 &&
      normalizedFilePath !== comparablePatchTarget

    const patchTargetDetected =
      comparablePatchTarget.length > 0 && pathMatchesDetectedTarget(comparablePatchTarget, detectedFileSet)

    const shouldWarnMissingPatchTarget =
      comparablePatchTarget.length > 0 &&
      !patchTargetDetected &&
      !isNewFileSuggestion

    const isApplyCandidate = !hasTargetMismatch && !shouldWarnMissingPatchTarget

    if (!isApplyCandidate) {
      return []
    }

    return [
      {
        issueId: aiFix.issueId,
        filePath: issue?.filePath ?? '',
        patchTarget: parsed.patchTarget ?? '',
        summary: parsed.summary ?? '',
        patchExample: parsed.patchExample ?? '',
        warnings: parsed.warnings ?? []
      }
    ]
  })
}

async function generateAiFixes(issues: AnalyzeIssue[]): Promise<{ aiEnabled: boolean; aiFixes: AiFixItem[] }> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return { aiEnabled: false, aiFixes: [] }
  }

  const client = new OpenAI({ apiKey })
  const aiFixes: AiFixItem[] = []

  for (const issue of issues) {
    const prompt = [
      'You are a code repair assistant.',
      'Return only valid JSON.',
      'Do not wrap the JSON in markdown code fences.',
      'Use this exact shape:',
      '{',
      '  "summary": "string",',
      '  "patchTarget": "string",',
      '  "patchExample": "string",',
      '  "warnings": ["string"]',
      '}',
      '',
      `Issue ID: ${issue.id}`,
      `Title: ${issue.title}`,
      `Reason: ${issue.reason}`,
      `Suggested Fix: ${issue.fix}`,
      `File Path: ${issue.filePath}`,
      `Evidence: ${issue.evidence}`,
      `Code Snippet: ${issue.codeSnippet}`
    ].join('\n')

    const completion = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    })

    const responseText =
      completion.output_text?.trim() ||
      '{ "summary": "", "patchTarget": "", "patchExample": "", "warnings": [] }'

    aiFixes.push({
      issueId: issue.id,
      response: responseText
    })
  }

  return { aiEnabled: true, aiFixes }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const uploadedFile = formData.get('file')

    if (!(uploadedFile instanceof File)) {

    return NextResponse.json(
        {
          ok: false,
          message: 'file is required'
        },
        { status: 400 }
      )
    }

    const bytes = Buffer.from(await uploadedFile.arrayBuffer())

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const runRoot = path.join(process.cwd(), 'tmp', 'runs', runId)
    const zipPath = path.join(runRoot, uploadedFile.name)
    const extractRoot = path.join(runRoot, 'extracted')

    ensureDir(runRoot)
    ensureDir(extractRoot)
    fs.writeFileSync(zipPath, bytes)

    const extractInfo = extractZipWithFallback(zipPath, extractRoot)
    const projectRoot = detectProjectRoot(extractInfo.scanRoot)
    const allFiles = listAllFiles(projectRoot)
    const detectedFiles = allFiles.map((filePath) => toRelativePath(projectRoot, filePath)).filter(isCodeFile)

    const summary = summarizeRepo(projectRoot)
    const issues = detectIssues(projectRoot, summary)
    const { aiEnabled, aiFixes } = await generateAiFixes(issues)
    const readyToApply = buildReadyToApply(aiFixes, issues, detectedFiles)

    await saveRunContext({
      projectRoot,
      scanRoot: extractInfo.scanRoot,
      fileName: uploadedFile.name,
    })

    const runContextPath = path.join(process.cwd(), 'tmp', 'run-context.json')
    fs.mkdirSync(path.dirname(runContextPath), { recursive: true })
    fs.writeFileSync(
      runContextPath,
      JSON.stringify(
        {
          projectRoot,
          scanRoot: extractInfo.scanRoot,
          fileName: uploadedFile.name,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      'utf8'
    )
    return NextResponse.json({ runId,
      ok: true,
      message: 'ZIP upload, extraction, scan, and summary generation completed successfully',
      fileName: uploadedFile.name,
      scanRoot: extractInfo.scanRoot,
      projectRoot,
      totalFileCount: allFiles.length,
      codeFileCount: detectedFiles.length,
      summary,
      aiEnabled,
      aiFixes,
      issues,
      readyToApplyCount: readyToApply.length,
      readyToApply,
      detectedFiles,
      scanRootEntries: listImmediateEntries(extractInfo.scanRoot),
      projectRootEntries: listImmediateEntries(projectRoot),
      allFilesSample: allFiles.slice(0, 30).map((filePath) => toRelativePath(projectRoot, filePath)),
      has7z: extractInfo.has7z,
      sevenZExtracted: extractInfo.sevenZExtracted
    })
  } catch (error) {

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'analyze failed'
      },
      { status: 500 }
    )
  }
}






