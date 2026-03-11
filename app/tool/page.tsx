'use client'

import { useMemo, useState } from 'react'
import SaasToolShell from './components/SaasToolShell'

type ParsedAiResponse = {
  summary?: string
  patchTarget?: string
  patchExample?: string
  warnings?: string[]
}

type AiFixItem = {
  issueId?: string
  response?: string
}

type IssueItem = {
  id?: string
  severity?: string
  title?: string
  reason?: string
  fix?: string
  filePath?: string
  evidence?: string
  codeSnippet?: string
}

type DisplayFixItem = {
  issueId: string
  rawResponse: string
  parsed: ParsedAiResponse | null
  issue?: IssueItem
  hasTargetMismatch: boolean
  patchTargetDetected: boolean
  shouldWarnMissingPatchTarget: boolean
  comparablePatchTarget: string
  isApplyCandidate: boolean
}

type AnalyzeResult = {
  ok?: boolean
  message?: string
  fileName?: string
  scanRoot?: string
  projectRoot?: string
  totalFileCount?: number
  codeFileCount?: number
  aiEnabled?: boolean
  aiFixes?: AiFixItem[]
  issues?: IssueItem[]
  detectedFiles?: string[]
  [key: string]: any
}

function parseAiResponse(raw: unknown): ParsedAiResponse | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)

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

function normalizePath(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replaceAll('\\', '/')
}

function extractComparablePatchTarget(value: string | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) {
    return ''
  }

  const filenameMatches = raw.match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g)

  if (filenameMatches && filenameMatches.length > 0) {
    return normalizePath(filenameMatches[filenameMatches.length - 1])
  }

  return normalizePath(raw)
}

function looksLikeNewFileSuggestion(issue: IssueItem | undefined, comparablePatchTarget: string): boolean {
  if (!issue) {
    return false
  }

  const title = (issue.title ?? '').toLowerCase()
  const evidence = (issue.evidence ?? '').toLowerCase()
  const codeSnippet = (issue.codeSnippet ?? '').toLowerCase()

  if (title.includes('missing readme') && normalizePath(issue.filePath) === 'readme.md') {
    return true
  }

  if (
    evidence.includes('readme.md not found in project root') &&
    codeSnippet.includes('readme.md file is missing') &&
    normalizePath(issue.filePath) === 'readme.md'
  ) {
    return true
  }

  if (comparablePatchTarget === 'readme.md') {
    return true
  }

  return false
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [isRepairing, setIsRepairing] = useState(false)

  const displayFixes = useMemo<DisplayFixItem[]>(() => {
    if (!result || !Array.isArray(result.aiFixes)) {
      return []
    }

    const detectedFileSet = new Set(
      Array.isArray(result.detectedFiles)
        ? result.detectedFiles.map((filePath) => normalizePath(filePath))
        : []
    )

    return result.aiFixes.map((fix, index) => {
      const issueId = fix.issueId ?? String(index)
      const rawResponse = fix.response ?? ''
      const parsed = parseAiResponse(rawResponse)
      const issue = Array.isArray(result.issues)
        ? result.issues.find((item) => item.id === fix.issueId)
        : undefined

      const normalizedFilePath = normalizePath(issue?.filePath)
      const extractedPatchTarget = extractComparablePatchTarget(parsed?.patchTarget)
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
        comparablePatchTarget.length > 0 && detectedFileSet.has(comparablePatchTarget)

      const shouldWarnMissingPatchTarget =
        comparablePatchTarget.length > 0 &&
        !patchTargetDetected &&
        !isNewFileSuggestion

      const isApplyCandidate = !hasTargetMismatch && !shouldWarnMissingPatchTarget

      return {
        issueId,
        rawResponse,
        parsed,
        issue,
        hasTargetMismatch,
        patchTargetDetected,
        shouldWarnMissingPatchTarget,
        comparablePatchTarget,
        isApplyCandidate
      }
    })
  }, [result])

  const readyToApplyFixes = useMemo(
    () => displayFixes.filter((fix) => fix.isApplyCandidate),
    [displayFixes]
  )

  const analysisSummary = useMemo(() => {
    if (!result) {
      return 'Upload a ZIP and run analysis.'
    }

    return [
      `Status: ${String(result.ok)}`,
      result.message ? `Message: ${result.message}` : '',
      result.fileName ? `File: ${result.fileName}` : '',
      typeof result.totalFileCount === 'number' ? `Files: ${result.totalFileCount}` : '',
      typeof result.codeFileCount === 'number' ? `Code files: ${result.codeFileCount}` : '',
      `Ready-to-apply fixes: ${readyToApplyFixes.length}`
    ]
      .filter(Boolean)
      .join('\n')
  }, [result, readyToApplyFixes.length])

  const verifySummary = useMemo(() => {
    if (isRepairing) {
      return 'Repair loop is running.'
    }

    if (!result) {
      return 'Verification has not been run yet.'
    }

    return 'Verification UI will be connected in the next step. Current page keeps analyze + apply logic intact.'
  }, [result, isRepairing])

  async function analyze() {
    if (!file) {
      alert('Select a ZIP file first.')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      setResult(data)
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Analyze failed'
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRepair() {
    if (!file) {
      alert('Select a ZIP file first.')
      return
    }

    setIsRepairing(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/repair-loop', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      setResult(data)
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Repair loop failed'
      })
    } finally {
      setIsRepairing(false)
    }
  }

  async function applyFix(fix: DisplayFixItem) {
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          issueId: fix.issueId,
          filePath: fix.issue?.filePath ?? '',
          patchTarget: fix.parsed?.patchTarget ?? '',
          patchExample: fix.parsed?.patchExample ?? ''
        })
      })

      const data = await res.json()
      alert(JSON.stringify(data, null, 2))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Apply failed')
    }
  }

  const uploadSlot = (
    <div className="space-y-4">
      <input
        type="file"
        accept=".zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-neutral-700"
      />
      <div className="text-sm text-neutral-600">
        {file ? `Selected: ${file.name}` : 'No ZIP selected'}
      </div>
    </div>
  )

  return (
    <div className="pb-10">
      <SaasToolShell
        fileName={file?.name ?? result?.fileName ?? ''}
        aiFixCount={displayFixes.length}
        issueCount={Array.isArray(result?.issues) ? result!.issues!.length : 0}
        repairLogCount={readyToApplyFixes.length}
        isAnalyzing={loading}
        isRepairing={isRepairing}
        canAnalyze={!!file && !isRepairing}
        canApply={readyToApplyFixes.length > 0 && !isRepairing}
        canVerify={false}
        canDownload={false}
        analysisSummary={analysisSummary}
        verifySummary={verifySummary}
        rawJson={result ? JSON.stringify(result, null, 2) : ''}
        uploadSlot={uploadSlot}
        onAnalyze={analyze}
        onRepair={handleRepair}
      />

      {readyToApplyFixes.length > 0 && (
        <div className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
              Ready To Apply
            </h2>

            <div className="mt-6 space-y-4">
              {readyToApplyFixes.map((fix) => (
                <div
                  key={fix.issueId}
                  className="rounded-2xl border border-neutral-200 p-5"
                >
                  <div className="text-sm text-neutral-700">
                    <strong>Issue ID:</strong> {fix.issueId}
                  </div>
                  <div className="mt-2 text-sm text-neutral-700">
                    <strong>Patch Target:</strong> {fix.parsed?.patchTarget ?? ''}
                  </div>
                  <div className="mt-3">
                    <strong className="text-sm text-neutral-900">Summary</strong>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                      {fix.parsed?.summary ?? ''}
                    </pre>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => applyFix(fix)}
                      className="inline-flex items-center justify-center rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {displayFixes.length > 0 && (
        <div className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
              AI Fixes
            </h2>

            <div className="mt-6 space-y-4">
              {displayFixes.map((fix) => (
                <div
                  key={fix.issueId}
                  className="rounded-2xl border border-neutral-200 p-5"
                >
                  <div className="text-sm text-neutral-700">
                    <strong>Issue ID:</strong> {fix.issueId}
                  </div>

                  <div className="mt-2 text-sm text-neutral-700">
                    <strong>Apply Candidate:</strong> {fix.isApplyCandidate ? 'yes' : 'no'}
                  </div>

                  {fix.issue && (
                    <div className="mt-4 space-y-2 text-sm text-neutral-700">
                      <div>
                        <strong>Severity:</strong> {fix.issue.severity ?? ''}
                      </div>
                      <div>
                        <strong>Title:</strong> {fix.issue.title ?? ''}
                      </div>
                      <div>
                        <strong>File Path:</strong> {fix.issue.filePath ?? ''}
                      </div>

                      <div className="mt-3">
                        <strong>Reason</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.issue.reason ?? ''}
                        </pre>
                      </div>

                      <div className="mt-3">
                        <strong>Detected Fix</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.issue.fix ?? ''}
                        </pre>
                      </div>

                      <div className="mt-3">
                        <strong>Evidence</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.issue.evidence ?? ''}
                        </pre>
                      </div>

                      <div className="mt-3">
                        <strong>Code Snippet</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.issue.codeSnippet ?? ''}
                        </pre>
                      </div>
                    </div>
                  )}

                  {fix.parsed ? (
                    <div className="mt-4 space-y-3 text-sm text-neutral-700">
                      <div>
                        <strong>Summary</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.parsed.summary || ''}
                        </pre>
                      </div>

                      <div>
                        <strong>Patch Target</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.parsed.patchTarget || ''}
                        </pre>
                      </div>

                      {fix.hasTargetMismatch && (
                        <div>
                          <strong>Target mismatch:</strong> detected filePath and AI patchTarget are different.
                        </div>
                      )}

                      {fix.shouldWarnMissingPatchTarget && (
                        <div>
                          <strong>Patch target not found in detectedFiles.</strong>
                        </div>
                      )}

                      <div>
                        <strong>Patch Example</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {fix.parsed.patchExample || ''}
                        </pre>
                      </div>

                      <div>
                        <strong>Warnings</strong>
                        {fix.parsed.warnings && fix.parsed.warnings.length > 0 ? (
                          <ul className="mt-1 list-disc pl-5">
                            {fix.parsed.warnings.map((warning, warningIndex) => (
                              <li key={warningIndex}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-1">None</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <strong className="text-sm text-neutral-900">Raw Response</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                        {fix.rawResponse}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}