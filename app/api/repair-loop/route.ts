import { NextRequest, NextResponse } from "next/server";

type RepairLoopRequestBody = {
  maxAttempts?: number;
};

type VerifyRunResponse = {
  ok?: boolean;
  success?: boolean;
  output?: string;
  commandName?: string | null;
  command?: string | null;
  executedCount?: number;
  steps?: unknown[];
};

type RepairOnceResponse = {
  ok?: boolean;
  message?: string;
  retryFix?: {
    ok?: boolean;
    aiFixes?: unknown[];
    message?: string;
  };
  applyResult?: {
    success?: boolean;
  } | null;
  verifyRunResult?: {
    success?: boolean;
    output?: string;
    commandName?: string | null;
    command?: string | null;
    executedCount?: number;
    steps?: unknown[];
  } | null;
};

export async function POST(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;

    let body: RepairLoopRequestBody = {};

    try {
      body = (await req.json()) as RepairLoopRequestBody;
    } catch {
      body = {};
    }

    const rawMaxAttempts =
      typeof body.maxAttempts === "number" && Number.isFinite(body.maxAttempts)
        ? Math.floor(body.maxAttempts)
        : 3;

    const maxAttempts = Math.min(Math.max(rawMaxAttempts, 1), 10);

    const initialVerifyRunRes = await fetch(`${origin}/api/verify-run`, {
      method: "POST",
      cache: "no-store"
    });

    const initialVerifyRun = (await initialVerifyRunRes.json()) as VerifyRunResponse;

    if (!initialVerifyRunRes.ok || initialVerifyRun.ok !== true) {
      return NextResponse.json(
        {
          ok: false,
          message: "repair-loop failed during initial verify-run",
          initialVerifyRun
        },
        { status: 500 }
      );
    }

    if (initialVerifyRun.success === true) {
      return NextResponse.json({
        ok: true,
        message: "repair-loop skipped: verify-run already succeeded",
        maxAttempts,
        completedAttempts: 0,
        finalSuccess: true,
        initialVerifyRun,
        attempts: []
      });
    }

    const attempts: Array<{
      attempt: number;
      ok: boolean;
      message?: string;
      hadAiFixes: boolean;
      applySuccess: boolean;
      verifySuccess: boolean;
      repairOnce: RepairOnceResponse;
    }> = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const repairOnceRes = await fetch(`${origin}/api/repair-once`, {
        method: "POST",
        cache: "no-store"
      });

      const repairOnce = (await repairOnceRes.json()) as RepairOnceResponse;

      const hadAiFixes =
        Array.isArray(repairOnce.retryFix?.aiFixes) &&
        repairOnce.retryFix.aiFixes.length > 0;

      const applySuccess = repairOnce.applyResult?.success === true;
      const verifySuccess = repairOnce.verifyRunResult?.success === true;

      attempts.push({
        attempt,
        ok: repairOnceRes.ok && repairOnce.ok === true,
        message: repairOnce.message,
        hadAiFixes,
        applySuccess,
        verifySuccess,
        repairOnce
      });

      if (verifySuccess) {
        return NextResponse.json({
          ok: true,
          message: "repair-loop succeeded",
          maxAttempts,
          completedAttempts: attempt,
          finalSuccess: true,
          initialVerifyRun,
          attempts
        });
      }

      if (!hadAiFixes) {
        return NextResponse.json({
          ok: true,
          message: "repair-loop stopped: no aiFixes returned",
          maxAttempts,
          completedAttempts: attempt,
          finalSuccess: false,
          initialVerifyRun,
          attempts
        });
      }

      if (!repairOnceRes.ok || repairOnce.ok !== true) {
        return NextResponse.json(
          {
            ok: false,
            message: "repair-loop failed during repair-once",
            maxAttempts,
            completedAttempts: attempt,
            finalSuccess: false,
            initialVerifyRun,
            attempts
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "repair-loop reached maxAttempts",
      maxAttempts,
      completedAttempts: attempts.length,
      finalSuccess: false,
      initialVerifyRun,
      attempts
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "repair-loop failed"
      },
      { status: 500 }
    );
  }
}
