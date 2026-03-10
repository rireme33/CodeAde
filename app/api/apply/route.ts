import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

type ApplyRequestBody = {
  issueId?: string;
  filePath?: string;
  action?: string;
  content?: string;
  projectRoot?: string;
};

const RUN_CONTEXT_PATH = path.join(process.cwd(), "tmp", "run-context.json");

type SavedRunContext = {
  projectRoot?: string;
};

function readSavedProjectRoot(): string | null {
  try {
    if (!fsSync.existsSync(RUN_CONTEXT_PATH)) {
      return null;
    }

    const raw = fsSync.readFileSync(RUN_CONTEXT_PATH, "utf8");
    const parsed = JSON.parse(raw) as SavedRunContext;

    if (typeof parsed.projectRoot !== "string" || !parsed.projectRoot.trim()) {
      return null;
    }

    return parsed.projectRoot.trim();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ApplyRequestBody;

    const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
    const filePath = typeof body.filePath === "string" ? body.filePath.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    const projectRoot =
      typeof body.projectRoot === "string" && body.projectRoot.trim()
        ? body.projectRoot.trim()
        : readSavedProjectRoot() ?? "";

    if (!issueId || !filePath || !action) {
      return NextResponse.json(
        {
          success: false,
          message: "issueId, filePath, and action are required"
        },
        { status: 400 }
      );
    }

    if (!projectRoot) {
      return NextResponse.json(
        {
          success: false,
          message: "projectRoot is required"
        },
        { status: 400 }
      );
    }

    if (action !== "create-or-replace") {
      return NextResponse.json(
        {
          success: false,
          message: "only create-or-replace is supported in this step"
        },
        { status: 400 }
      );
    }

    const resolvedProjectRoot = path.resolve(projectRoot);
    const targetPath = path.resolve(resolvedProjectRoot, filePath);

    if (
      targetPath !== resolvedProjectRoot &&
      !targetPath.startsWith(resolvedProjectRoot + path.sep)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "targetPath must stay inside projectRoot"
        },
        { status: 400 }
      );
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");

    return NextResponse.json({
      success: true,
      message: "file applied",
      issueId,
      filePath,
      action,
      targetPath,
      usedProjectRoot: projectRoot
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "unknown apply error"
      },
      { status: 400 }
    );
  }
}
