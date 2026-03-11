type SaasToolShellProps = {
  fileName?: string
  aiFixCount?: number
  issueCount?: number
  repairLogCount?: number
  isAnalyzing?: boolean
  isApplying?: boolean
  isVerifying?: boolean
  isRepairing?: boolean
  canAnalyze?: boolean
  canApply?: boolean
  canVerify?: boolean
  canDownload?: boolean
  analysisSummary?: string
  verifySummary?: string
  rawJson?: string
  uploadSlot?: React.ReactNode
  onAnalyze?: () => void
  onApply?: () => void
  onVerify?: () => void
  onRepair?: () => void
  onDownload?: () => void
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
        {value}
      </p>
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "inline-flex min-h-12 items-center justify-center rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex min-h-12 items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 transition disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {label}
    </button>
  )
}

function StatusPill({
  label,
  active = false,
}: {
  label: string
  active?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-neutral-950 text-white"
          : "bg-neutral-200 text-neutral-700"
      }`}
    >
      {label}
    </span>
  )
}

export default function SaasToolShell({
  fileName,
  aiFixCount = 0,
  issueCount = 0,
  repairLogCount = 0,
  isAnalyzing = false,
  isApplying = false,
  isVerifying = false,
  isRepairing = false,
  canAnalyze = false,
  canApply = false,
  canVerify = false,
  canDownload = false,
  analysisSummary,
  verifySummary,
  rawJson,
  uploadSlot,
  onAnalyze,
  onApply,
  onVerify,
  onRepair,
  onDownload,
}: SaasToolShellProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.4fr_0.9fr] lg:px-8 lg:py-10">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-neutral-500">
                AI Repository Repair
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
                Repair broken repos faster with CodeAde
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600 sm:text-base">
                Upload a ZIP, analyze issues, apply AI fixes, run verification,
                and download a repaired repository from one workflow.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <StatusPill
                  label={fileName ? `ZIP: ${fileName}` : "No ZIP uploaded"}
                  active={!!fileName}
                />
                <StatusPill label="Analyzing" active={isAnalyzing} />
                <StatusPill label="Applying" active={isApplying} />
                <StatusPill label="Verifying" active={isVerifying} />
                <StatusPill label="Repair Loop" active={isRepairing} />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
                Workflow
              </p>
              <div className="mt-4 space-y-3 text-sm text-neutral-700">
                <div>1. Upload repository ZIP</div>
                <div>2. Analyze project and issues</div>
                <div>3. Generate AI repairs</div>
                <div>4. Apply fixes</div>
                <div>5. Verify with install / test flow</div>
                <div>6. Retry until stable</div>
                <div>7. Download repaired ZIP</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Detected Issues" value={issueCount} />
          <MetricCard label="AI Fixes" value={aiFixCount} />
          <MetricCard label="Repair Logs" value={repairLogCount} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
                  Upload Repository
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Keep the current upload logic. Replace only the visual wrapper.
                </p>
              </div>

              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6">
                {uploadSlot || (
                  <div className="text-sm text-neutral-500">
                    Upload input will be mounted here.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
                  Status Summary
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Move debug output into clearer product-level summaries.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
                    Analysis
                  </p>
                  <p className="mt-3 text-sm leading-7 text-neutral-700">
                    {analysisSummary || "No analysis result yet."}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
                    Verification
                  </p>
                  <p className="mt-3 text-sm leading-7 text-neutral-700">
                    {verifySummary || "No verification result yet."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
                  Raw Output
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Keep this during development, but visually downgrade it.
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-950 p-4">
                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-neutral-100">
                  {rawJson || "No raw output yet."}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
                  Actions
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Match the actual repair pipeline used by the engine.
                </p>
              </div>

              <div className="grid gap-3">
                <ActionButton
                  label={isAnalyzing ? "Analyzing..." : "Analyze Repository"}
                  onClick={onAnalyze}
                  disabled={!canAnalyze || isAnalyzing}
                  primary
                />
                <ActionButton
                  label={isApplying ? "Applying..." : "Apply AI Fixes"}
                  onClick={onApply}
                  disabled={!canApply || isApplying}
                />
                <ActionButton
                  label={isVerifying ? "Verifying..." : "Verify Repository"}
                  onClick={onVerify}
                  disabled={!canVerify || isVerifying}
                />
                <ActionButton
                  label={isRepairing ? "Repairing..." : "Run Repair Loop"}
                  onClick={onRepair}
                  disabled={isRepairing}
                />
                <ActionButton
                  label="Download Repaired ZIP"
                  onClick={onDownload}
                  disabled={!canDownload}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
                  Plan Access
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Temporary product framing before Stripe integration.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-sm font-semibold text-neutral-900">Free</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    ZIP upload and repository analysis
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4 text-white">
                  <p className="text-sm font-semibold">Pro</p>
                  <p className="mt-1 text-sm text-neutral-200">
                    AI repair, verification, retry loop, and ZIP download
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}