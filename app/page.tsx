'use client'

import { useMemo, useState } from 'react'

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

  async function analyze() {
    if (!file) {
      alert('select zip')
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
        message: error instanceof Error ? error.message : 'analyze failed'
      })
    } finally {
      setLoading(false)
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
      alert(error instanceof Error ? error.message : 'apply failed')
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial, sans-serif' }}>
      <h1>CodeAde</h1>

      <div style={{ marginTop: 20 }}>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={analyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 32 }}>
          <h2>Analysis Result</h2>

          <div style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>
            <div>ok: {String(result.ok)}</div>
            <div>message: {result.message ?? ''}</div>
            <div>fileName: {result.fileName ?? ''}</div>
            <div>scanRoot: {result.scanRoot ?? ''}</div>
            <div>projectRoot: {result.projectRoot ?? ''}</div>
            <div>totalFileCount: {String(result.totalFileCount ?? '')}</div>
            <div>codeFileCount: {String(result.codeFileCount ?? '')}</div>
            <div>aiEnabled: {String(result.aiEnabled ?? '')}</div>
          </div>

          {readyToApplyFixes.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h2>Ready To Apply</h2>

              {readyToApplyFixes.map((fix) => (
                <div
                  key={fix.issueId}
                  style={{
                    border: '1px solid #ccc',
                    padding: 16,
                    marginTop: 16,
                    borderRadius: 8
                  }}
                >
                  <div>
                    <strong>Issue ID:</strong> {fix.issueId}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Apply Candidate:</strong> yes
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Patch Target:</strong> {fix.parsed?.patchTarget ?? ''}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Summary</strong>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>
                      {fix.parsed?.summary ?? ''}
                    </pre>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => applyFix(fix)}>
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {displayFixes.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h2>AI Fixes</h2>

              {displayFixes.map((fix) => (
                <div
                  key={fix.issueId}
                  style={{
                    border: '1px solid #ccc',
                    padding: 16,
                    marginTop: 16,
                    borderRadius: 8
                  }}
                >
                  <div>
                    <strong>Issue ID:</strong> {fix.issueId}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <strong>Apply Candidate:</strong> {fix.isApplyCandidate ? 'yes' : 'no'}
                  </div>

                  {fix.issue && (
                    <div style={{ marginTop: 12 }}>
                      <div>
                        <strong>Severity:</strong> {fix.issue.severity ?? ''}
                      </div>
                      <div>
                        <strong>Title:</strong> {fix.issue.title ?? ''}
                      </div>
                      <div>
                        <strong>File Path:</strong> {fix.issue.filePath ?? ''}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Reason</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.issue.reason ?? ''}
                        </pre>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Detected Fix</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.issue.fix ?? ''}
                        </pre>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Evidence</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.issue.evidence ?? ''}
                        </pre>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Code Snippet</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.issue.codeSnippet ?? ''}
                        </pre>
                      </div>
                    </div>
                  )}

                  {fix.parsed ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ marginTop: 8 }}>
                        <strong>Summary</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.parsed.summary || ''}
                        </pre>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Patch Target</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.parsed.patchTarget || ''}
                        </pre>
                      </div>

                      {fix.hasTargetMismatch && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Target mismatch:</strong> detected filePath and AI patchTarget are different.
                        </div>
                      )}

                      {fix.shouldWarnMissingPatchTarget && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Patch target not found in detectedFiles.</strong>
                        </div>
                      )}

                      <div style={{ marginTop: 8 }}>
                        <strong>Patch Example</strong>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>
                          {fix.parsed.patchExample || ''}
                        </pre>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <strong>Warnings</strong>
                        {fix.parsed.warnings && fix.parsed.warnings.length > 0 ? (
                          <ul>
                            {fix.parsed.warnings.map((warning, warningIndex) => (
                              <li key={warningIndex}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          <div>None</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <strong>Raw Response</strong>
                      <pre style={{ whiteSpace: 'pre-wrap' }}>
                        {fix.rawResponse}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 32 }}>
            <h2>Raw JSON</h2>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </main>
  )
}


