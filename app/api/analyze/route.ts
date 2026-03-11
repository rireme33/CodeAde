import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import { spawnSync } from "child_process";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getAppTmpRoot(): string {
  return path.join(os.tmpdir(), "codeade");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function shouldSkipDirectory(dirName: string): boolean {
  return [
    "node_modules",
    ".git",
    ".next",
    ".wrangler",
    "dist",
    "build"
  ].includes(dirName);
}

function walkFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      results.push(fullPath);
    }
  }

  walk(rootDir);
  return results;
}

function detectProjectRoot(scanRoot: string): string {
  const candidates: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[] = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const names = entries.map((e) => e.name);

    if (
      names.includes("package.json") ||
      names.includes("wrangler.jsonc") ||
      names.includes("wrangler.json") ||
      names.includes("wrangler.toml")
    ) {
      candidates.push(dir);
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;

      if (shouldSkipDirectory(e.name)) {
        continue;
      }

      walk(path.join(dir, e.name));
    }
  }

  function scoreProjectRoot(dir: string): number {
    let score = 0;

    if (fs.existsSync(path.join(dir, "package.json"))) score += 5;
    if (fs.existsSync(path.join(dir, "tsconfig.json"))) score += 3;
    if (fs.existsSync(path.join(dir, "schema.sql"))) score += 2;
    if (fs.existsSync(path.join(dir, "wrangler.jsonc"))) score += 5;
    if (fs.existsSync(path.join(dir, "wrangler.json"))) score += 4;
    if (fs.existsSync(path.join(dir, "wrangler.toml"))) score += 3;
    if (fs.existsSync(path.join(dir, "src", "index.ts"))) score += 6;
    if (fs.existsSync(path.join(dir, "src", "index.tsx"))) score += 5;
    if (fs.existsSync(path.join(dir, "src", "index.js"))) score += 4;
    if (fs.existsSync(path.join(dir, "src", "index.jsx"))) score += 3;

    return score;
  }

  walk(scanRoot);

  if (candidates.length === 0) return scanRoot;

  candidates.sort((a, b) => {
    const scoreDiff = scoreProjectRoot(b) - scoreProjectRoot(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return a.length - b.length;
  });

  return candidates[0];
}

function isCodeFile(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();

  if (
    fileName === "package-lock.json" ||
    fileName === "yarn.lock" ||
    fileName === "pnpm-lock.yaml"
  ) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  return [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".jsonc",
    ".sql",
    ".css",
    ".html",
    ".md",
    ".yml",
    ".yaml"
  ].includes(ext);
}

function readTextPreview(filePath: string, maxLength = 300): string {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
  } catch {
    return "";
  }
}

function stripJsonComments(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .trim();
}

function readWranglerInfo(projectRoot: string) {
  const wranglerJsoncPath = path.join(projectRoot, "wrangler.jsonc");
  const wranglerJsonPath = path.join(projectRoot, "wrangler.json");

  const result = {
    wranglerPath: "",
    wranglerMain: "",
    wranglerPreview: "",
    rawText: "",
    parsed: null as Record<string, unknown> | null,
  };

  const candidates = [wranglerJsoncPath, wranglerJsonPath];

  for (const wranglerPath of candidates) {
    if (!fs.existsSync(wranglerPath)) continue;

    result.wranglerPath = path.relative(projectRoot, wranglerPath);
    result.wranglerPreview = readTextPreview(wranglerPath, 500);

    try {
      const raw = fs.readFileSync(wranglerPath, "utf8");
      result.rawText = raw;

      const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
      result.parsed = parsed;

      if (typeof parsed?.main === "string") {
        result.wranglerMain = parsed.main;
      }
    } catch {
    }

    return result;
  }

  return result;
}

function findEntryFile(projectRoot: string): string {
  const wranglerInfo = readWranglerInfo(projectRoot);

  if (wranglerInfo.wranglerMain) {
    const localResolved = path.join(projectRoot, wranglerInfo.wranglerMain);
    if (fs.existsSync(localResolved)) {
      return localResolved;
    }

    const parentResolved = path.join(path.dirname(projectRoot), wranglerInfo.wranglerMain);
    if (fs.existsSync(parentResolved)) {
      return parentResolved;
    }
  }

  const candidates = [
    path.join(projectRoot, "src", "index.ts"),
    path.join(projectRoot, "src", "index.tsx"),
    path.join(projectRoot, "src", "index.js"),
    path.join(projectRoot, "src", "index.jsx"),
    path.join(projectRoot, "index.ts"),
    path.join(projectRoot, "index.tsx"),
    path.join(projectRoot, "index.js"),
    path.join(projectRoot, "index.jsx"),
    path.join(projectRoot, "worker.ts"),
    path.join(projectRoot, "worker.js"),
    path.join(path.dirname(projectRoot), "src", "index.ts"),
    path.join(path.dirname(projectRoot), "src", "index.tsx"),
    path.join(path.dirname(projectRoot), "src", "index.js"),
    path.join(path.dirname(projectRoot), "src", "index.jsx")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

function resolveProjectRoot(projectRoot: string): string {
  if (
    fs.existsSync(path.join(projectRoot, "package.json")) ||
    fs.existsSync(path.join(projectRoot, "wrangler.jsonc")) ||
    fs.existsSync(path.join(projectRoot, "wrangler.json")) ||
    fs.existsSync(path.join(projectRoot, "wrangler.toml"))
  ) {
    return projectRoot;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return projectRoot;
  }

  const childCandidates = entries
    .filter((entry) => entry.isDirectory() && !shouldSkipDirectory(entry.name))
    .map((entry) => path.join(projectRoot, entry.name))
    .filter((childDir) => {
      return (
        fs.existsSync(path.join(childDir, "package.json")) ||
        fs.existsSync(path.join(childDir, "wrangler.jsonc")) ||
        fs.existsSync(path.join(childDir, "wrangler.json")) ||
        fs.existsSync(path.join(childDir, "wrangler.toml"))
      );
    });

  if (childCandidates.length === 1) {
    return childCandidates[0];
  }

  if (childCandidates.length > 1) {
    childCandidates.sort((a, b) => b.length - a.length);
    return childCandidates[0];
  }

  return projectRoot;
}

function readPackageJson(projectRoot: string) {
  const packageJsonPath = path.join(projectRoot, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasDependency(
  packageJson: Record<string, unknown> | null,
  packageName: string
): boolean {
  if (!packageJson) return false;

  const dependencies =
    packageJson.dependencies && typeof packageJson.dependencies === "object"
      ? (packageJson.dependencies as Record<string, unknown>)
      : {};

  const devDependencies =
    packageJson.devDependencies && typeof packageJson.devDependencies === "object"
      ? (packageJson.devDependencies as Record<string, unknown>)
      : {};

  return packageName in dependencies || packageName in devDependencies;
}

function detectRepoType(
  projectRoot: string,
  entryFilePath: string,
  wranglerInfo: ReturnType<typeof readWranglerInfo>
) {
  const packageJson = readPackageJson(projectRoot);
  const entryExt = entryFilePath ? path.extname(entryFilePath).toLowerCase() : "";
  const entryPreview = entryFilePath ? readTextPreview(entryFilePath, 800) : "";
  const wranglerParsed = wranglerInfo.parsed;

  let runtime = "unknown";
  let framework = "unknown";
  let platform = "unknown";
  let database = "unknown";

  let runtimeReason = "";
  let frameworkReason = "";
  let platformReason = "";
  let databaseReason = "";

  if (
    entryExt === ".ts" ||
    entryExt === ".tsx" ||
    fs.existsSync(path.join(projectRoot, "tsconfig.json")) ||
    hasDependency(packageJson, "typescript")
  ) {
    runtime = "typescript";
    runtimeReason = "tsconfig.json or TypeScript entry/dependency detected";
  } else if (entryExt === ".js" || entryExt === ".jsx") {
    runtime = "javascript";
    runtimeReason = "JavaScript entry file detected";
  }

  const hasWrangler = Boolean(wranglerInfo.wranglerPath);
  const looksLikeWorker =
    hasWrangler ||
    /export\s+default\s*\{/.test(entryPreview) ||
    /addEventListener\s*\(\s*["']fetch["']/.test(entryPreview) ||
    /\bfetch\s*\(\s*request\s*[:,)]/.test(entryPreview) ||
    /\bRequest\b/.test(entryPreview) ||
    /\bResponse\b/.test(entryPreview);

  if (looksLikeWorker) {
    framework = "worker";
    frameworkReason = "wrangler or worker-like fetch handler detected";
  }

  if (hasWrangler) {
    platform = "cloudflare-workers";
    platformReason = "wrangler config detected";
  }

  const wranglerHasD1 =
    Boolean(wranglerParsed) &&
    Array.isArray((wranglerParsed as Record<string, unknown>).d1_databases);

  const schemaSqlPath = path.join(projectRoot, "schema.sql");
  const schemaPreview = fs.existsSync(schemaSqlPath)
    ? readTextPreview(schemaSqlPath, 500)
    : "";

  const usesSqliteLikeSignals =
    /\bCREATE\s+TABLE\b/i.test(schemaPreview) ||
    /\bINSERT\s+INTO\b/i.test(schemaPreview) ||
    /\bSELECT\b/i.test(schemaPreview);

  if (wranglerHasD1) {
    database = "d1/sqlite";
    databaseReason = "d1_databases found in wrangler config";
  } else if (usesSqliteLikeSignals) {
    database = "sqlite";
    databaseReason = "SQL schema signals detected";
  }

  return {
    runtime,
    runtimeReason,
    framework,
    frameworkReason,
    platform,
    platformReason,
    database,
    databaseReason
  };
}

function collectDisplayFiles(projectRoot: string): string[] {
  const files = new Set<string>();

  for (const filePath of walkFiles(projectRoot)) {
    files.add(filePath);
  }

  const entryFilePath = findEntryFile(projectRoot);
  if (
    entryFilePath &&
    fs.existsSync(entryFilePath) &&
    entryFilePath !== projectRoot &&
    !entryFilePath.startsWith(projectRoot + path.sep)
  ) {
    files.add(entryFilePath);
  }

  return Array.from(files);
}

function formatSampleFilePath(projectRoot: string, filePath: string): string {
  if (filePath === projectRoot || filePath.startsWith(projectRoot + path.sep)) {
    return path.relative(projectRoot, filePath);
  }

  const parentRoot = path.dirname(projectRoot);
  return path.relative(parentRoot, filePath);
}
type RepoTypeSummary = {
  runtime: string;
  runtimeReason: string;
  framework: string;
  frameworkReason: string;
  platform: string;
  platformReason: string;
  database: string;
  databaseReason: string;
};

type BuildSummaryResult = {
  hasPackageJson: boolean;
  hasTsconfig: boolean;
  hasSchemaSql: boolean;
  hasSrcIndexTs: boolean;
  packageName: string;
  scriptNames: string[];
  wranglerPath: string;
  wranglerMain: string;
  wranglerPreview: string;
  entryFile: string;
  srcIndexPreview: string;
} & RepoTypeSummary;
type AnalyzeIssue = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  reason: string
  fix: string
  filePath: string | null
  evidence: string | null
  codeSnippet: string | null
};

function detectIssues(projectRoot: string, summary: BuildSummaryResult): AnalyzeIssue[] {
  const issues: AnalyzeIssue[] = [];
  const scriptNames = summary.scriptNames ?? [];

  const hasUsefulScript =
    scriptNames.includes("dev") ||
    scriptNames.includes("start") ||
    scriptNames.includes("build") ||
    scriptNames.includes("deploy");

  if (summary.hasPackageJson && !hasUsefulScript) {
    issues.push({
      id: "missing-useful-npm-scripts",
      severity: "warning",
      title: "Missing useful npm scripts",
      reason:
        "package.json exists, but common execution scripts such as dev, start, build, or deploy were not found.",
      fix:
        "Add scripts like dev, build, or deploy to package.json so the project can be run and verified more easily.",
      filePath: null,
      evidence: null,
      codeSnippet: null,
    });
  }

  const readmePath = path.join(projectRoot, "README.md");

  if (!fs.existsSync(readmePath)) {
    issues.push({
      id: "missing-readme",
      severity: "info",
      title: "Missing README",
      reason:
        "README.md was not found in the project root, so setup steps and project purpose are harder to understand.",
      fix:
        "Add a README.md with project overview, setup steps, run commands, and deployment notes.",
      filePath: null,
      evidence: null,
      codeSnippet: null,
    });
  }

  const usesDiscordWebhook =
    summary.srcIndexPreview.includes("DISCORD_WEBHOOK_URL") ||
    summary.wranglerPreview.includes("DISCORD_WEBHOOK_URL");

  const hasVarsSection =
    summary.wranglerPreview.includes('"vars"') ||
    summary.wranglerPreview.includes("'vars'") ||
    summary.wranglerPreview.includes("DISCORD_WEBHOOK_URL");

  if (usesDiscordWebhook && !hasVarsSection) {
    issues.push({
      id: "missing-env-binding-discord-webhook-url",
      severity: "warning",
      title: "Missing env binding for DISCORD_WEBHOOK_URL",
      reason:
        "The code references DISCORD_WEBHOOK_URL, but that binding was not found in the detected Wrangler config preview.",
      fix:
        "Add DISCORD_WEBHOOK_URL to Wrangler vars or secrets so the Worker can access the webhook at runtime.",
      filePath: null,
      evidence: null,
      codeSnippet: null,
    });
  }

  return issues;
}

function buildSummary(projectRoot: string): BuildSummaryResult {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  const schemaSqlPath = path.join(projectRoot, "schema.sql");
  const entryFilePath = findEntryFile(projectRoot);
  const srcIndexTsPath = entryFilePath;
  const wranglerInfo = readWranglerInfo(projectRoot);
  const repoType = detectRepoType(projectRoot, entryFilePath, wranglerInfo);

  let packageName = "";
  let scriptNames: string[] = [];

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      packageName = typeof packageJson.name === "string" ? packageJson.name : "";
      if (packageJson.scripts && typeof packageJson.scripts === "object") {
        scriptNames = Object.keys(packageJson.scripts);
      }
    } catch {
    }
  }

  return {
    hasPackageJson: fs.existsSync(packageJsonPath),
    hasTsconfig: fs.existsSync(tsconfigPath),
    hasSchemaSql: fs.existsSync(schemaSqlPath),
    hasSrcIndexTs: Boolean(srcIndexTsPath && fs.existsSync(srcIndexTsPath)),
    packageName,
    scriptNames,
    wranglerPath: wranglerInfo.wranglerPath,
    wranglerMain: wranglerInfo.wranglerMain,
    wranglerPreview: wranglerInfo.wranglerPreview,
    entryFile: wranglerInfo.wranglerMain
      ? wranglerInfo.wranglerMain.replaceAll("/", "\\")
      : (
          entryFilePath
            ? (
                entryFilePath.startsWith(projectRoot + path.sep) || entryFilePath === projectRoot
                  ? path.relative(projectRoot, entryFilePath)
                  : path.relative(path.dirname(projectRoot), entryFilePath)
              )
            : ""
        ),
    srcIndexPreview: entryFilePath ? readTextPreview(entryFilePath) : "",
    runtime: repoType.runtime,
    runtimeReason: repoType.runtimeReason,
    framework: repoType.framework,
    frameworkReason: repoType.frameworkReason,
    platform: repoType.platform,
    platformReason: repoType.platformReason,
    database: repoType.database,
    databaseReason: repoType.databaseReason
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "file がありません" },
        { status: 400 }
      );
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const runsRoot = path.join(getAppTmpRoot(), "runs");
    const workRoot = path.join(runsRoot, runId);
    const uploadDir = path.join(workRoot, "uploads");
    const extractDir = path.join(workRoot, "extracted");

    ensureDir(uploadDir);
    ensureDir(extractDir);

    const zipPath = path.join(uploadDir, file.name);
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    const extractedFiles = walkFiles(extractDir);
    const sevenZPath = extractedFiles.find((p) => p.toLowerCase().endsWith(".7z"));

    let scanRoot = extractDir;
    let has7z = false;
    let sevenZExtracted = false;

    if (sevenZPath) {
      has7z = true;

      const sevenZOutputDir = path.join(path.dirname(sevenZPath), "_7z_extracted");
      ensureDir(sevenZOutputDir);

      const sevenZipExe = path.join(
        process.cwd(),
        "node_modules",
        "7zip-bin",
        "win",
        "x64",
        "7za.exe"
      );

      const result = spawnSync(
        sevenZipExe,
        ["x", sevenZPath, "-y", `-o${sevenZOutputDir}`],
        { encoding: "utf8" }
      );

      if (result.status === 0) {
        sevenZExtracted = true;
        scanRoot = sevenZOutputDir;
      }
    }

    let projectRoot = detectProjectRoot(scanRoot);
    projectRoot = resolveProjectRoot(projectRoot);

    const allProjectFiles = collectDisplayFiles(projectRoot).sort((a, b) =>
      a.localeCompare(b)
    );
    const codeFiles = allProjectFiles.filter(isCodeFile).sort((a, b) =>
      a.localeCompare(b)
    );
    const summary = buildSummary(projectRoot);
    const issues = detectIssues(projectRoot, summary);
    const aiInputIssues = issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      reason: issue.reason,
      fix: issue.fix,
      filePath: issue.filePath,
      evidence: issue.evidence,
      codeSnippet: issue.codeSnippet
    }));

    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    const aiFixes = [];

    
if (hasOpenAiKey && aiInputIssues.length > 0) {
    
  try {
    
    const firstIssue = aiInputIssues[0];
    
    const completion = await openai.responses.create({
    
      model: "gpt-4o-mini",
    
      input: [
    
        {
    
          role: "system",
    
          content: "You are a senior TypeScript code repair assistant. Return concise JSON only."
    
        },
    
        {
    
          role: "user",
    
          content: JSON.stringify({
    
            task: "Create a practical fix proposal for the issue.",
    
            issue: firstIssue
    
          })
    
        }
    
      ]
    
    });

    
    aiFixes.push({
    
      issueId: firstIssue.id,
    
      response: completion.output_text ?? ""
    
    });
    
  } catch (error) {
    
    aiFixes.push({
    
      issueId: aiInputIssues[0].id,
    
      response: error instanceof Error ? error.message : String(error)
    
    });
    
  }
    
}



    return NextResponse.json({
      ok: true,
      message: "ZIP upload, extraction, scan, and summary generation completed successfully",
      fileName: file.name,
      scanRoot,
      projectRoot,
      totalFileCount: allProjectFiles.length,
      codeFileCount: codeFiles.length,
      summary,
      aiEnabled: hasOpenAiKey,
      aiFixes,
      issues: issues.map((issue) => {
            if (issue.id === "missing-useful-npm-scripts") {
              return { ...issue, filePath: "package.json", evidence: "package.json scripts do not include dev, start, build, or deploy", codeSnippet: "\"scripts\": { \"test\": \"...\" }" }
            }

            if (issue.id === "missing-readme") {
              return { ...issue, filePath: "README.md", evidence: "README.md not found in project root", codeSnippet: "README.md file is missing in project root" }
            }
            if (issue.id === "missing-env-binding-discord-webhook-url") {
              return { ...issue, filePath: "wrangler.jsonc", evidence: "DISCORD_WEBHOOK_URL referenced in src\index.ts but not found in wrangler.jsonc", codeSnippet: "DISCORD_WEBHOOK_URL: string;" }
            }
            if (issue.id === "missing-env-binding-discord-webhook-url") {
              return { ...issue, filePath: "wrangler.jsonc", evidence: "DISCORD_WEBHOOK_URL referenced in src\index.ts but not found in wrangler.jsonc", codeSnippet: "DISCORD_WEBHOOK_URL: string;" }
            }
            return { ...issue, filePath: issue.filePath ?? null, evidence: issue.evidence ?? null, codeSnippet: issue.codeSnippet ?? null }
          }), detectedFiles: codeFiles
        .slice(0, 20)
        .map((p) => formatSampleFilePath(projectRoot, p)),
      has7z,
      sevenZExtracted
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Analysis failed",
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}














































