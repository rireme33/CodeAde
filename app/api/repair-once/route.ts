import { NextRequest, NextResponse } from "next/server";
import path from "path";

type RetryFixItem = {
  issueId?: string;
  filePath?: string;
  action?: string;
  content?: string;
};

type RetryFixVerifyRun = {
  projectRoot?: string | null;
  packageRoot?: string | null;
  scanRoot?: string | null;
  fileName?: string | null;
};

type RetryFixResponse = {
  ok?: boolean;
  aiFixes?: RetryFixItem[];
  verifyRun?: RetryFixVerifyRun;
  source?: string;
  message?: string;
};

function normalizeFixFilePath(filePath: string, projectRoot: string): string {
  const trimmed = filePath.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  const baseName = path.basename(projectRoot).trim();

  if (!trimmed || !baseName) {
    return trimmed;
  }

  const prefix = `${baseName}/`;

  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }

  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;

    const retryFixRes = await fetch(`${origin}/api/retry-fix`, {
      method: "POST",
      cache: "no-store"
    });

    const retryFix = (await retryFixRes.json()) as RetryFixResponse;

    if (!retryFixRes.ok || !retryFix.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "retry-fix",
          retryFix
        },
        { status: 500 }
      );
    }

    const firstFix = Array.isArray(retryFix.aiFixes) ? retryFix.aiFixes[0] : null;

    if (!firstFix) {
      return NextResponse.json({
        ok: true,
        step: "retry-fix",
        message: "no aiFixes returned",
        retryFix,
        applyResult: null,
        verifyRunResult: null
      });
    }

    const preferredProjectRoot =
      typeof retryFix.verifyRun?.packageRoot === "string" && retryFix.verifyRun.packageRoot.trim()
        ? retryFix.verifyRun.packageRoot.trim()
        : typeof retryFix.verifyRun?.projectRoot === "string" && retryFix.verifyRun.projectRoot.trim()
          ? retryFix.verifyRun.projectRoot.trim()
          : "";

    const normalizedFilePath =
      typeof firstFix.filePath === "string" && preferredProjectRoot
        ? normalizeFixFilePath(firstFix.filePath, preferredProjectRoot)
        : typeof firstFix.filePath === "string"
          ? firstFix.filePath
          : "";

    const applyBody = {
      issueId: typeof firstFix.issueId === "string" ? firstFix.issueId : "",
      filePath: normalizedFilePath,
      action: typeof firstFix.action === "string" ? firstFix.action : "",
      content: typeof firstFix.content === "string" ? firstFix.content : "",
      projectRoot: preferredProjectRoot
    };

    const applyRes = await fetch(`${origin}/api/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(applyBody),
      cache: "no-store"
    });

    const applyResult = await applyRes.json();

    if (!applyRes.ok || !applyResult?.success) {
      return NextResponse.json(
        {
          ok: false,
          step: "apply",
          retryFix,
          selectedFix: applyBody,
          applyResult
        },
        { status: 500 }
      );
    }

    const verifyRunBody = {
      projectRoot:
        typeof retryFix.verifyRun?.projectRoot === "string" ? retryFix.verifyRun.projectRoot : "",
      scanRoot:
        typeof retryFix.verifyRun?.scanRoot === "string" ? retryFix.verifyRun.scanRoot : "",
      fileName:
        typeof retryFix.verifyRun?.fileName === "string" ? retryFix.verifyRun.fileName : ""
    };

    const verifyRunRes = await fetch(`${origin}/api/verify-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(verifyRunBody),
      cache: "no-store"
    });

    const verifyRunResult = await verifyRunRes.json();

    if (!verifyRunRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "verify-run",
          retryFix,
          selectedFix: applyBody,
          applyResult,
          verifyRunBody,
          verifyRunResult
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "repair-once completed",
      retryFix,
      selectedFix: applyBody,
      applyResult,
      verifyRunBody,
      verifyRunResult
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "repair-once failed"
      },
      { status: 500 }
    );
  }
}
