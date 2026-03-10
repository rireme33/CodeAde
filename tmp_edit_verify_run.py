from pathlib import Path
import re
import sys

file_path = Path(r"C:\Users\user\Desktop\codedino\repo-audit-mvp\app\api\verify-run\route.ts")
text = file_path.read_text(encoding="utf-8")

original = text

if 'from "fs/promises"' not in text and "from 'fs/promises'" not in text:
    m = re.search(r'^(import .*?;\r?\n)+', text, re.MULTILINE)
    if not m:
        print("import block not found")
        sys.exit(1)
    insert_at = m.end()
    text = text[:insert_at] + 'import { mkdir, writeFile } from "fs/promises";\n' + text[insert_at:]

if 'from "path"' not in text and "from 'path'" not in text:
    m = re.search(r'^(import .*?;\r?\n)+', text, re.MULTILINE)
    if not m:
        print("import block not found")
        sys.exit(1)
    insert_at = m.end()
    text = text[:insert_at] + 'import path from "path";\n' + text[insert_at:]

pattern = r'return\s+NextResponse\.json\(\s*(\{[\s\S]*?\})\s*\);\s*\n\s*\}\s*$'
m = re.search(pattern, text)
if not m:
    print("final return NextResponse.json({...}) block not found")
    sys.exit(1)

obj = m.group(1)

replacement = f'''const responseBody = {obj};

  const latestVerifyRunPath = path.join(process.cwd(), "tmp", "latest-verify-run.json");

  await mkdir(path.dirname(latestVerifyRunPath), {{ recursive: true }});

  await writeFile(
    latestVerifyRunPath,
    JSON.stringify(
      {{
        ...responseBody,
        projectRoot: runContext.projectRoot,
        scanRoot: runContext.scanRoot,
        fileName: runContext.fileName,
        generatedAt: new Date().toISOString(),
      }},
      null,
      2
    ),
    "utf8"
  );

  return NextResponse.json(responseBody);
}}
'''

text = text[:m.start()] + replacement

if text == original:
    print("no changes applied")
    sys.exit(1)

file_path.write_text(text, encoding="utf-8")
print("updated:", file_path)
