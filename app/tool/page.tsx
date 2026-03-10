import Link from "next/link";

const steps = [
  {
    title: "Upload a broken repo",
    description:
      "Drop in a ZIP file containing a broken project. CodeAde inspects the structure, config, dependencies, and source files.",
  },
  {
    title: "AI analyzes and repairs",
    description:
      "The engine generates fixes, applies changes, runs verification, and retries automatically until the repo is stable.",
  },
  {
    title: "Download the repaired repo",
    description:
      "Get a cleaned and repaired ZIP back without unnecessary folders like node_modules or .wrangler.",
  },
];

const demoItems = [
  "Fix broken AI-generated code",
  "Resolve failed installs and config issues",
  "Repair test and build errors",
  "Loop until verification succeeds",
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    description: "Best for trying CodeAde on broken repos.",
    features: ["ZIP upload", "Analyze repo", "AI fix preview"],
    cta: "Try Analyze",
    href: "/tool",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9/mo",
    description: "For developers who want full automated repair.",
    features: ["Everything in Free", "Repair broken repo", "Download fixed repo"],
    cta: "Start Repairing",
    href: "/tool",
    highlight: true,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.16),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-200">
              AI repo repair for indie developers
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Fix broken repos automatically.
            </h1>

            <p className="mt-6 text-lg leading-8 text-slate-300 sm:text-xl">
              Upload a broken repo. Get a working repo back.
            </p>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400">
              CodeAde helps developers recover broken AI-generated projects,
              outdated repositories, failed installs, and broken test setups
              with an automated repair loop.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/tool"
                className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Open Tool
              </Link>
              <a
                href="#pricing"
                className="inline-flex min-w-[180px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View Pricing
              </a>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Built for</div>
                <div className="mt-2 font-semibold text-white">
                  indie developers
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Built for</div>
                <div className="mt-2 font-semibold text-white">AI coders</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm text-slate-400">Built for</div>
                <div className="mt-2 font-semibold text-white">vibe coders</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            How it works
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            From broken ZIP to repaired repo
          </h2>
          <p className="mt-4 text-slate-400">
            CodeAde is designed for repos that no longer build, install, or
            pass verification.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/10 bg-slate-900/70 p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/5">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-2 lg:px-8">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
              Demo
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for real broken repo problems
            </h2>
            <p className="mt-4 max-w-xl text-slate-400">
              CodeAde focuses on common failure patterns that developers hit
              after AI generation, dependency drift, config mismatch, or broken
              testing environments.
            </p>

            <ul className="mt-8 space-y-4">
              {demoItems.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-4"
                >
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-400" />
                  <span className="text-slate-200">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="rounded-2xl border border-white/10 bg-slate-950 p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="text-sm text-slate-400">Session</div>
                  <div className="mt-1 font-semibold text-white">
                    repo-audit-demo.zip
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Verified
                </span>
              </div>

              <div className="space-y-4 py-5 text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="font-medium text-white">Analyze</div>
                  <div className="mt-1 text-slate-400">
                    Detected dependency issues, invalid config, and failing test
                    setup.
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="font-medium text-white">Repair Loop</div>
                  <div className="mt-1 text-slate-400">
                    Applied fixes, ran verification, retried until success.
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="font-medium text-emerald-300">
                    Download Ready
                  </div>
                  <div className="mt-1 text-emerald-100/80">
                    Repaired ZIP generated successfully.
                  </div>
                </div>
              </div>

              <Link
                href="/tool"
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Try the Tool
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            Pricing
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Start free. Upgrade when you need repair.
          </h2>
          <p className="mt-4 text-slate-400">
            A simple pricing model for analyzing broken repos and unlocking full
            automated repair.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-3xl border p-8 ${
                plan.highlight
                  ? "border-blue-500/40 bg-blue-500/10"
                  : "border-white/10 bg-slate-900/70"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                  <p className="mt-2 text-slate-400">{plan.description}</p>
                </div>
                {plan.highlight && (
                  <span className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white">
                    Popular
                  </span>
                )}
              </div>

              <div className="mt-6 text-4xl font-bold text-white">
                {plan.price}
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                    <span className="text-slate-200">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
                  plan.highlight
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-blue-600/20 via-slate-900 to-purple-600/20 p-8 sm:p-10">
          <div className="max-w-3xl">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
              CTA
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Recover broken repos without manual debugging.
            </h2>
            <p className="mt-4 text-slate-300">
              Upload a broken project, inspect the analysis, preview the AI
              fixes, and repair the repo automatically.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/tool"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              >
                Launch CodeAde
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                See Plans
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}