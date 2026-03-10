import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const EXCLUDE = new Set(["node_modules", ".wrangler"]);

function copyFiltered(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const e of entries) {
    if (EXCLUDE.has(e.name)) continue;

    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);

    if (e.isDirectory()) {
      copyFiltered(s, d);
      continue;
    }

    fs.copyFileSync(s, d);
  }
}

function zipDir(src: string, zip: string) {
  const seven = "C:\\Program Files\\7-Zip\\7z.exe";

  if (fs.existsSync(seven)) {
    execSync(`& "${seven}" a -tzip "${zip}" ".\\*"`, {
      cwd: src,
      shell: "powershell.exe"
    });
    return;
  }

  execSync(
    `Compress-Archive -Path ".\\*" -DestinationPath "${zip}" -Force`,
    {
      cwd: src,
      shell: "powershell.exe"
    }
  );
}

function readVerify() {
  const p = path.join(process.cwd(), "tmp", "latest-verify-run.json");

  if (!fs.existsSync(p)) return null;

  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function build(projectRoot: string) {
  const verify = readVerify();

  if (!verify) {
    return NextResponse.json(
      { ok: false, message: "latest verify missing" },
      { status: 404 }
    );
  }

  if (!verify.success) {
    return NextResponse.json(
      { ok: false, message: "verify not success" },
      { status: 409 }
    );
  }

  const root = verify.packageRoot || verify.projectRoot;

  if (!root || !fs.existsSync(root)) {
    return NextResponse.json(
      { ok: false, message: "verified root missing" },
      { status: 404 }
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "codeade-"));

  const stage = path.join(tmp, "stage");
  const zip = path.join(tmp, "repo.zip");

  copyFiltered(root, stage);

  zipDir(stage, zip);

  const buf = fs.readFileSync(zip);

  fs.rmSync(tmp, { recursive: true, force: true });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="repaired.zip"'
    }
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const root = body?.projectRoot || body?.packageRoot;

  if (!root) {
    return NextResponse.json(
      { ok: false, message: "projectRoot required" },
      { status: 400 }
    );
  }

  return build(root);
}

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("projectRoot");

  if (!root) {
    return NextResponse.json(
      { ok: false, message: "projectRoot required" },
      { status: 400 }
    );
  }

  return build(root);
}