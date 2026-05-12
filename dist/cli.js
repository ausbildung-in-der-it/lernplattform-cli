// src/utils/env.ts
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import { config as dotenvConfig } from "dotenv";
function loadEnv() {
  const candidates = [];
  if (process.env.LERNPLATTFORM_ENV_FILE) {
    candidates.push(process.env.LERNPLATTFORM_ENV_FILE);
  }
  candidates.push(resolve(process.cwd(), ".env"));
  candidates.push(resolve(homedir(), ".config", "lernplattform", ".env"));
  for (const path2 of candidates) {
    if (existsSync(path2)) {
      dotenvConfig({ path: path2, override: false });
      return { source: path2 };
    }
  }
  return { source: null };
}

// src/utils/args.ts
import * as fs from "fs";
function parseCliArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...valueParts] = arg.slice(2).split("=");
      const value = valueParts.join("=");
      flags[key] = parseValue(value);
      i++;
    } else if (arg.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      const key = arg.slice(2);
      flags[key] = parseValue(argv[i + 1]);
      i += 2;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      flags[key] = true;
      i++;
    } else if (arg.startsWith("-") && arg.length === 2) {
      flags[arg.slice(1)] = true;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { positional, flags };
}
function parseValue(value) {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}
function getRequiredArg(args, index, name) {
  const value = args.positional[index];
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}
function getOptionalFlag(args, key, defaultValue) {
  return args.flags[key] ?? defaultValue;
}
function decodeBase64Json(base64) {
  try {
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in Base64 data: ${error.message}`);
    }
    throw new Error(`Failed to decode Base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function readJsonFromStdin() {
  try {
    const input = fs.readFileSync(0, "utf-8").trim();
    if (!input) {
      throw new Error("No input received from stdin");
    }
    return JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON from stdin: ${error.message}`);
    }
    throw new Error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function readTextFromStdin() {
  try {
    const input = fs.readFileSync(0, "utf-8");
    if (!input) {
      throw new Error("No input received from stdin");
    }
    return input;
  } catch (error) {
    throw new Error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function decodeBase64Text(base64) {
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch (error) {
    throw new Error(`Failed to decode Base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function getJsonData(args, flagName) {
  if (args.flags[`${flagName}-stdin`]) {
    return readJsonFromStdin();
  }
  const base64Value = args.flags[`${flagName}-base64`];
  if (base64Value) {
    return decodeBase64Json(base64Value);
  }
  const normalValue = args.flags[flagName];
  if (normalValue !== void 0) {
    if (typeof normalValue === "object") {
      return normalValue;
    }
    if (typeof normalValue === "string") {
      try {
        return JSON.parse(normalValue);
      } catch {
        return normalValue;
      }
    }
    return normalValue;
  }
  return void 0;
}
function getTextData(args, flagName) {
  if (args.flags[`${flagName}-stdin`]) {
    return readTextFromStdin();
  }
  const base64Value = args.flags[`${flagName}-base64`];
  if (base64Value) {
    return decodeBase64Text(base64Value);
  }
  const normalValue = args.flags[flagName];
  if (normalValue !== void 0) {
    return String(normalValue);
  }
  return void 0;
}

// src/utils/save.ts
import { writeFileSync, mkdirSync, existsSync as existsSync2 } from "fs";
import { join } from "path";
function saveToFile(type, slug, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/:/g, "-").split(".")[0];
  const typeMap = {
    lesson: "lessons",
    module: "modules",
    path: "learning-paths",
    practice: "practice-tasks"
  };
  const dir = join("backups", typeMap[type]);
  const filename = `${type}_${slug}_${timestamp}.json`;
  const filepath = join(dir, filename);
  if (!existsSync2(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  return filepath;
}

// src/commands/lesson.ts
function getApiBaseUrl() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/lessons`;
}
function getAuthToken() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listLessons(page, perPage, token) {
  const url = `${getApiBaseUrl()}?page=${page}&per_page=${perPage}`;
  const startTime = Date.now();
  console.error(`
Listing lessons from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getLesson(slug, token) {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Getting lesson from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createLesson(data, token) {
  const url = getApiBaseUrl();
  const startTime = Date.now();
  console.error(`
Creating lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   XP: ${data.xp}`);
  if (data.blocks) {
    console.error(`   Blocks: ${data.blocks.length} block(s)`);
  }
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateLesson(slug, data, token) {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Updating lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteLesson(slug, token) {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Deleting lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function getLessonMdx(slug, token) {
  const url = `${getApiBaseUrl()}/${slug}/mdx`;
  const startTime = Date.now();
  console.error(`
Getting MDX content from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "text/plain"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.text();
}
async function run(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp();
      return;
    }
    const token = getAuthToken();
    let result;
    switch (operation) {
      case "list": {
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        const perPage = parseInt(getOptionalFlag(args, "per-page", "20"), 10);
        result = await listLessons(page, perPage, token);
        break;
      }
      case "get": {
        const slug = getRequiredArg(args, 0, "slug");
        result = await getLesson(slug, token);
        if (args.flags["save-to-file"]) {
          const filepath = saveToFile("lesson", slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }
      case "create": {
        const title = getOptionalFlag(args, "title");
        const slug = getOptionalFlag(args, "slug");
        const moduleIdStr = getOptionalFlag(args, "module-id");
        const type = getOptionalFlag(args, "type");
        const xpStr = getOptionalFlag(args, "xp");
        const status = getOptionalFlag(args, "status", "draft");
        if (!title || !slug || !moduleIdStr || !type || xpStr === void 0) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--title", "--slug", "--module-id", "--type", "--xp"],
            optional: ["--status (default: draft)", "--description", "--content", "--position", "--blocks"],
            types: ["text", "mdx", "interactive"]
          }, null, 2));
          process.exit(1);
        }
        const moduleId = parseInt(moduleIdStr, 10);
        if (isNaN(moduleId)) {
          throw new Error("--module-id must be a number");
        }
        const xp = parseInt(xpStr, 10);
        if (isNaN(xp) || xp < 0) {
          throw new Error("--xp must be a non-negative number");
        }
        const createData = {
          title,
          slug,
          module_id: moduleId,
          type,
          xp,
          editorial_status: status
        };
        if (args.flags.description) createData.description = args.flags.description;
        const content = getTextData(args, "content");
        if (content) createData.content = content;
        if (args.flags.position !== void 0) {
          createData.position = parseInt(args.flags.position, 10);
        }
        const blocks = getJsonData(args, "blocks");
        if (blocks) createData.blocks = blocks;
        result = await createLesson(createData, token);
        break;
      }
      case "update": {
        const slug = getRequiredArg(args, 0, "slug");
        const updateData = {};
        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags["module-id"]) {
          updateData.module_id = parseInt(args.flags["module-id"], 10);
        }
        if (args.flags.description) updateData.description = args.flags.description;
        const content = getTextData(args, "content");
        if (content) updateData.content = content;
        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags.position !== void 0) {
          updateData.position = parseInt(args.flags.position, 10);
        }
        if (args.flags.xp !== void 0) {
          updateData.xp = parseInt(args.flags.xp, 10);
        }
        const blocks = getJsonData(args, "blocks");
        if (blocks) updateData.blocks = blocks;
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--title", "--module-id", "--description", "--content", "--type", "--status", "--position", "--xp", "--blocks"]
          }, null, 2));
          process.exit(1);
        }
        result = await updateLesson(slug, updateData, token);
        break;
      }
      case "delete": {
        const slug = getRequiredArg(args, 0, "slug");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteLesson(slug, token);
        result = { success: true, message: "Lesson deleted successfully" };
        break;
      }
      case "mdx": {
        const slug = getRequiredArg(args, 0, "slug");
        const mdxContent = await getLessonMdx(slug, token);
        console.log(mdxContent);
        return;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete", "mdx"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp() {
  console.log(`Lesson CLI - Manage lessons

USAGE:
  lernplattform lesson <operation> [args] [flags]

OPERATIONS:
  list                List all lessons (paginated)
  get <slug>          Get a specific lesson with blocks
  mdx <slug>          Get raw MDX content of a lesson
  create              Create a new lesson (optionally with blocks)
  update <slug>       Update an existing lesson (including blocks)
  delete <slug>       Delete a lesson (requires --confirm)

EXAMPLES:

  LIST LESSONS:
    lernplattform lesson list
    lernplattform lesson list --page=2 --per-page=10

  GET LESSON:
    lernplattform lesson get sql-basics
    lernplattform lesson get sql-basics --save-to-file

  GET MDX CONTENT:
    lernplattform lesson mdx einfuehrung-in-projekte
    lernplattform lesson mdx sql-basics > lesson.mdx

  CREATE LESSON (Basic):
    lernplattform lesson create \\
      --title="SQL Einfuehrung" \\
      --slug="sql-einfuehrung" \\
      --module-id=122 \\
      --type="interactive" \\
      --xp=100

  CREATE LESSON (With all fields):
    lernplattform lesson create \\
      --title="SQL Joins" \\
      --slug="sql-joins" \\
      --module-id=122 \\
      --type="interactive" \\
      --xp=200 \\
      --status="published" \\
      --description="Lerne SQL Joins" \\
      --position=3

  CREATE LESSON WITH BLOCKS (using stdin - RECOMMENDED):
    lernplattform lesson create \\
      --title="OOP Grundlagen" \\
      --slug="oop-grundlagen" \\
      --module-id=122 \\
      --type="interactive" \\
      --xp=150 \\
      --blocks-stdin <<'EOF'
    [
      {
        "type":"textBlock",
        "section":"hook",
        "data":{"title":"Einstieg in OOP","content":"Objektorientierte Programmierung..."}
      },
      {
        "type":"textBlock",
        "section":"knowledge1",
        "data":{"title":"Klassen und Objekte","content":"Eine Klasse ist..."}
      },
      {
        "type":"interactiveQuiz",
        "section":"quiz1",
        "data":{
          "questions":[
            {
              "question":"Was ist eine Klasse?",
              "options":[
                {"text":"Eine Vorlage fuer Objekte"},
                {"text":"Ein Objekt"},
                {"text":"Eine Funktion"}
              ],
              "correctAnswer":[0],
              "explanation":"Eine Klasse ist eine Vorlage fuer Objekte.",
              "content":null
            }
          ]
        }
      }
    ]
    EOF

  CREATE LESSON WITH BLOCKS (using Base64):
    lernplattform lesson create \\
      --title="Test Lesson" \\
      --slug="test-lesson" \\
      --module-id=122 \\
      --type="interactive" \\
      --xp=100 \\
      --blocks-base64="$(echo '[{"type":"textBlock","section":"hook","data":{"title":"Test","content":"Content"}}]' | base64)"

  UPDATE LESSON (Basic fields):
    lernplattform lesson update sql-basics --title="SQL Basics Updated"
    lernplattform lesson update sql-basics --title="New Title" --xp=250 --status="published"

  UPDATE LESSON (With content):
    lernplattform lesson update sql-basics --content-stdin <<'EOF'
    # SQL Basics

    This lesson covers SQL fundamentals...
    EOF

  UPDATE LESSON BLOCKS (REPLACES all blocks):
    lernplattform lesson update sql-basics --blocks-stdin <<'EOF'
    [
      {"type":"textBlock","section":"hook","data":{"title":"Updated Hook","content":"New intro..."}},
      {"type":"textBlock","section":"knowledge1","data":{"title":"New Content","content":"..."}}
    ]
    EOF

  DELETE LESSON:
    lernplattform lesson delete old-lesson --confirm

REQUIRED FLAGS (for create):
  --title="..."         Lesson title
  --slug="..."          Lesson slug (unique identifier)
  --module-id=N         Module ID (number)
  --type="..."          Lesson type: text, mdx, or interactive
  --xp=N                Experience points (non-negative integer, REQUIRED!)

OPTIONAL FLAGS:
  --page=N              Page number (for list, default: 1)
  --per-page=N          Items per page (for list, default: 20)
  --status="..."        Editorial status: draft or published (default: draft)
  --description="..."   Lesson description
  --content="..."       Lesson content (markdown/HTML)
  --content-base64="..." Content as Base64-encoded (avoids shell escaping)
  --content-stdin       Read content from stdin (use with heredoc or pipe)
  --position=N          Position in module
  --blocks='[...]'      JSON array of blocks (not recommended, use stdin or base64)
  --blocks-base64="..." Blocks as Base64-encoded JSON array
  --blocks-stdin        Read blocks JSON from stdin (RECOMMENDED for complex blocks)
  --save-to-file        Save response to backups/ (for get operation)
  --confirm             Confirm deletion (required for delete operation)

BLOCKS FORMAT:
  Each block must have: type, section, data

  Block types:
    - "textBlock" - Text content with optional title
    - "interactiveQuiz" - Quiz questions

  Sections (in order):
    - "hook" - Introduction/hook
    - "learningObjectives" - Learning objectives
    - "transition" - Transition text
    - "knowledge1" - First knowledge section
    - "quiz1" - First quiz
    - "knowledge2" - Second knowledge section
    - "quiz2" - Second quiz
    - "outlook" - Summary and outlook

  Example textBlock:
    {
      "type": "textBlock",
      "section": "hook",
      "data": {
        "title": "Einfuehrung",
        "content": "Markdown content here..."
      }
    }

  Example interactiveQuiz:
    {
      "type": "interactiveQuiz",
      "section": "quiz1",
      "data": {
        "questions": [
          {
            "question": "Was ist SQL?",
            "options": [
              {"text": "Eine Datenbanksprache"},
              {"text": "Eine Programmiersprache"},
              {"text": "Ein Betriebssystem"}
            ],
            "correctAnswer": [0],
            "explanation": "SQL ist eine Datenbanksprache.",
            "content": null
          }
        ]
      }
    }

JSON INPUT METHODS (to avoid shell escaping issues):
  1. stdin with heredoc (RECOMMENDED):
     lernplattform lesson create ... --blocks-stdin <<'EOF'
     [...]
     EOF

  2. Base64 encoding:
     lernplattform lesson create ... --blocks-base64="$(echo '[...]' | base64)"

  3. Pipe from file:
     cat blocks.json | lernplattform lesson create ... --blocks-stdin

  Priority: stdin > base64 > normal

WORKFLOWS (verkettet mit anderen Bereichen):

  Discovery -> Read -> Export (Lesson per Suche finden):
    # 'search' liefert Laravel-Paginator. Lesson-Treffer in .data:
    SLUG=$(lernplattform search "datenbanken" 2>/dev/null \\
      | jq -r '.data[] | select(.type=="lesson") | .slug' | head -1)
    lernplattform lesson get "$SLUG" | jq '{id, title, type, blocks: (.blocks|length)}'
    # MDX-Export funktioniert nur fuer Lessons vom Typ 'mdx' oder 'text':
    #   lernplattform lesson mdx "$SLUG" > "$SLUG.mdx"

  Lesson neu mit Modul-Kontext (Modul vorher per Slug holen):
    MODULE_ID=$(lernplattform module get relationale-datenbanken 2>/dev/null | jq '.id')
    lernplattform lesson create \\
      --title="SQL Subqueries" --slug="sql-subqueries" \\
      --module-id="$MODULE_ID" --type=interactive --xp=150

  Block-Anzahl pruefen vor Update (REPLACE-Semantik!):
    lernplattform lesson get sql-basics --save-to-file       # Backup nach backups/
    lernplattform blocks list sql-basics | jq 'length'       # vorher zaehlen
    lernplattform lesson update sql-basics --blocks-stdin <<'EOF'
    [ ... vollstaendige neue Blockliste ... ]
    EOF

OUTPUT:
  stdout = reines JSON aus der API. stderr = Status-/Debug-Logs.
  Exit 0 = Erfolg. Exit 1 = stderr enthaelt {"error": "..."}.
  Use jq for custom formatting:
    lernplattform lesson list | jq '.data[] | "\\(.id) \\(.title)"'
    lernplattform lesson get sql-basics | jq '.blocks | length'

NOTES:
  - XP is REQUIRED when creating lessons (API enforces this)
  - Status defaults to "draft" if not specified
  - Blocks koennen mit create direkt mitgegeben oder spaeter via 'lernplattform blocks create' angelegt werden
  - 'lernplattform lesson update --blocks-stdin' ERSETZT alle Blocks. Fuer einzelne Aenderungen 'lernplattform blocks update' verwenden.
  - Use --save-to-file with get to backup before making changes
`);
}

// src/commands/module.ts
function getApiBaseUrl2() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/modules`;
}
function getAuthToken2() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry2(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listModules(page, perPage, token) {
  const url = `${getApiBaseUrl2()}?page=${page}&per_page=${perPage}`;
  const startTime = Date.now();
  console.error(`
Listing modules from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry2(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getModule(slug, token) {
  const url = `${getApiBaseUrl2()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Getting module from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry2(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createModule(data, token) {
  const url = getApiBaseUrl2();
  const startTime = Date.now();
  console.error(`
Creating module via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry2(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateModule(slug, data, token) {
  const url = `${getApiBaseUrl2()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Updating module via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry2(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteModule(slug, token) {
  const url = `${getApiBaseUrl2()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Deleting module via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry2(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function run2(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp2();
      return;
    }
    const token = getAuthToken2();
    let result;
    switch (operation) {
      case "list": {
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        const perPage = parseInt(getOptionalFlag(args, "per-page", "20"), 10);
        result = await listModules(page, perPage, token);
        break;
      }
      case "get": {
        const slug = getRequiredArg(args, 0, "slug");
        result = await getModule(slug, token);
        if (args.flags["save-to-file"]) {
          const filepath = saveToFile("module", slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }
      case "create": {
        const title = getOptionalFlag(args, "title");
        const slug = getOptionalFlag(args, "slug");
        const type = getOptionalFlag(args, "type", "normal");
        const status = getOptionalFlag(args, "status", "draft");
        if (!title || !slug) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--title", "--slug"],
            optional: ["--type (default: normal)", "--status (default: draft)", "--description", "--position"]
          }, null, 2));
          process.exit(1);
        }
        const createData = {
          title,
          slug,
          type,
          editorial_status: status,
          description: args.flags.description || title
        };
        if (args.flags.position !== void 0) {
          createData.position = parseInt(args.flags.position, 10);
        }
        result = await createModule(createData, token);
        break;
      }
      case "update": {
        const slug = getRequiredArg(args, 0, "slug");
        const updateData = {};
        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags.position !== void 0) {
          updateData.position = parseInt(args.flags.position, 10);
        }
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--title", "--description", "--type", "--status", "--position"]
          }, null, 2));
          process.exit(1);
        }
        result = await updateModule(slug, updateData, token);
        break;
      }
      case "delete": {
        const slug = getRequiredArg(args, 0, "slug");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteModule(slug, token);
        result = { success: true, message: "Module deleted successfully" };
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp2() {
  console.log(`Module CLI - Manage modules

USAGE:
  lernplattform module <operation> [args] [flags]

OPERATIONS:
  list                List all modules (paginated)
  get <slug>          Get a specific module
  create              Create a new module
  update <slug>       Update an existing module
  delete <slug>       Delete a module (requires --confirm)

EXAMPLES:

  List Operations:
    # First page (default: 20 items)
    lernplattform module list

    # Page 2 with 10 items
    lernplattform module list --page=2 --per-page=10

  Get Operations:
    # Get module with all lessons
    lernplattform module get relationale-datenbanken

    # Get and save to backups/
    lernplattform module get relationale-datenbanken --save-to-file

  Create Operations:
    # Create draft module
    lernplattform module create \\
      --title="Neues Modul" \\
      --slug="neues-modul" \\
      --type="normal" \\
      --status="draft" \\
      --description="Modul Beschreibung"

    # Create published exam prep module
    lernplattform module create \\
      --title="Pruefungsvorbereitung SQL" \\
      --slug="pruefung-sql" \\
      --type="exam_prep" \\
      --status="published" \\
      --position=1

  Update Operations:
    # Update title only
    lernplattform module update relationale-datenbanken --title="Neue Datenbanken"

    # Update multiple fields
    lernplattform module update test-modul \\
      --title="Updated Title" \\
      --description="Updated description" \\
      --status="published"

    # Change position
    lernplattform module update test-modul --position=5

  Delete Operations:
    # Delete module (requires --confirm for safety)
    lernplattform module delete old-module --confirm

    WARNING: This will permanently delete the module and all its lessons!

FLAGS:

  List/Get Flags:
    --page=N            Page number (for list, default: 1)
    --per-page=N        Items per page (for list, default: 20)
    --save-to-file      Save response to backups/ (for get)

  Create Flags (Required):
    --title="..."       Module title
    --slug="..."        Unique slug identifier
    --type="..."        Module type (normal or exam_prep)
    --status="..."      Editorial status (draft or published)

  Create Flags (Optional):
    --description="..." Module description
    --position=N        Display order (number)

  Update Flags (all optional, at least one required):
    --title="..."       Module title
    --description="..." Module description
    --type="..."        Module type (normal or exam_prep)
    --status="..."      Editorial status (draft or published)
    --position=N        Display order (number)

  Delete Flags:
    --confirm           Confirm deletion (REQUIRED for delete)

OUTPUT:
  All commands return raw JSON from the API.
  Use jq for custom formatting:
    lernplattform module list | jq '.data[] | "\\(.id) \\(.title)"'
    lernplattform module get slug | jq '.lessons | length'
`);
}

// src/commands/blocks.ts
function getApiBaseUrl3(lessonSlug) {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/lessons/${lessonSlug}/blocks`;
}
function getAuthToken3() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry3(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listBlocks(lessonSlug, token) {
  const url = getApiBaseUrl3(lessonSlug);
  const startTime = Date.now();
  console.error(`
Listing blocks from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getBlock(lessonSlug, blockId, token) {
  const url = `${getApiBaseUrl3(lessonSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Getting block from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createBlock(lessonSlug, data, token) {
  const url = getApiBaseUrl3(lessonSlug);
  const startTime = Date.now();
  console.error(`
Creating block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   Section: ${data.section}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateBlock(lessonSlug, blockId, data, token) {
  const url = `${getApiBaseUrl3(lessonSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Updating block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteBlock(lessonSlug, blockId, token) {
  const url = `${getApiBaseUrl3(lessonSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Deleting block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function reorderBlocks(lessonSlug, blockIds, token) {
  const url = `${getApiBaseUrl3(lessonSlug)}/reorder`;
  const startTime = Date.now();
  console.error(`
Reordering blocks via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Block IDs: ${blockIds.join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ block_ids: blockIds })
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function bulkOperation(lessonSlug, bulkOp, blocks, token) {
  const url = `${getApiBaseUrl3(lessonSlug)}/bulk`;
  const startTime = Date.now();
  console.error(`
Bulk ${bulkOp} via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Operation: ${bulkOp}`);
  console.error(`   Block count: ${blocks.length}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry3(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ operation: bulkOp, blocks })
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run3(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp3();
      return;
    }
    const token = getAuthToken3();
    let result;
    switch (operation) {
      case "list": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        result = await listBlocks(lessonSlug, token);
        break;
      }
      case "get": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        result = await getBlock(lessonSlug, blockId, token);
        break;
      }
      case "create": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const type = getOptionalFlag(args, "type");
        const section = getOptionalFlag(args, "section");
        const data = getJsonData(args, "data");
        if (!type || !section || !data) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--type (textBlock|interactiveQuiz)", "--section", "--data (JSON object)"],
            optional: ["--position"],
            alternatives: {
              "--data-base64": "Base64-encoded JSON (avoids shell escaping)",
              "--data-stdin": "Read JSON from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        const createData = { type, section, data };
        if (args.flags.position !== void 0) {
          createData.position = parseInt(args.flags.position, 10);
        }
        result = await createBlock(lessonSlug, createData, token);
        break;
      }
      case "update": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        const updateData = {};
        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.section) updateData.section = args.flags.section;
        const data = getJsonData(args, "data");
        if (data) updateData.data = data;
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--type", "--section", "--data"],
            alternatives: {
              "--data-base64": "Base64-encoded JSON (avoids shell escaping)",
              "--data-stdin": "Read JSON from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        result = await updateBlock(lessonSlug, blockId, updateData, token);
        break;
      }
      case "delete": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteBlock(lessonSlug, blockId, token);
        result = { success: true, message: "Block deleted successfully" };
        break;
      }
      case "reorder": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const blockIdsArg = getRequiredArg(args, 1, "block-ids (comma-separated)");
        const blockIds = blockIdsArg.split(",").map((id) => id.trim());
        result = await reorderBlocks(lessonSlug, blockIds, token);
        break;
      }
      case "bulk": {
        const lessonSlug = getRequiredArg(args, 0, "lesson-slug");
        const bulkOp = getOptionalFlag(args, "operation", "update");
        const blocksData = getJsonData(args, "blocks");
        if (!blocksData) {
          console.error(JSON.stringify({
            error: "Missing required field",
            required: ["--blocks (JSON array)"],
            optional: ["--operation (update|delete, default: update)"],
            alternatives: {
              "--blocks-base64": "Base64-encoded JSON array (avoids shell escaping)",
              "--blocks-stdin": "Read JSON array from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        result = await bulkOperation(lessonSlug, bulkOp, blocksData, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete", "reorder", "bulk"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp3() {
  console.log(`Blocks CLI - Manage lesson blocks

USAGE:
  lernplattform blocks <operation> [args] [flags]

OPERATIONS:
  list <lesson-slug>              List all blocks in a lesson
  get <lesson-slug> <block-id>    Get a specific block
  create <lesson-slug>            Create a new block
  update <lesson-slug> <block-id> Update a block
  delete <lesson-slug> <block-id> Delete a block (requires --confirm)
  reorder <lesson-slug> <ids>     Reorder blocks (comma-separated IDs)
  bulk <lesson-slug>              Bulk update/delete blocks

EXAMPLES:

  # List blocks
  lernplattform blocks list sql-grundlagen

  # Get specific block
  lernplattform blocks get sql-grundlagen abc123defg

  # Create text block
  lernplattform blocks create sql-grundlagen \\
    --type="textBlock" \\
    --section="knowledge1" \\
    --data='{"title":"SQL Einf\xFChrung","content":"SQL ist..."}'

  # Create quiz block (full example)
  lernplattform blocks create sql-grundlagen \\
    --type="interactiveQuiz" \\
    --section="quiz1" \\
    --data='{
      "questions": [
        {
          "question": "Was ist SQL?",
          "answers": [
            "Eine Datenbanksprache",
            "Eine Programmiersprache",
            "Ein Betriebssystem"
          ],
          "correct": 0
        }
      ]
    }'

  # Create with position
  lernplattform blocks create sql-grundlagen \\
    --type="textBlock" \\
    --section="knowledge2" \\
    --data='{"title":"Titel","content":"Inhalt"}' \\
    --position=5

  # Update block data
  lernplattform blocks update sql-grundlagen abc123defg \\
    --data='{"title":"Updated Title","content":"Updated content"}'

  # Change block section
  lernplattform blocks update sql-grundlagen abc123defg --section="knowledge2"

  # Delete block
  lernplattform blocks delete sql-grundlagen abc123defg --confirm

  # Reorder blocks
  lernplattform blocks reorder sql-grundlagen abc123,xyz789,quiz456

  # Bulk update
  lernplattform blocks bulk sql-grundlagen \\
    --operation="update" \\
    --blocks='[
      {"id":"abc123","section":"updated_section"},
      {"id":"xyz789","data":{"title":"Bulk Updated"}}
    ]'

  # Bulk delete
  lernplattform blocks bulk sql-grundlagen \\
    --operation="delete" \\
    --blocks='[
      {"id":"abc123"},
      {"id":"xyz789"}
    ]'

FLAGS:
  --type="..."           Block type (textBlock|interactiveQuiz)
  --section="..."        Section name (hook|learningObjectives|transition|
                         knowledge1|quiz1|knowledge2|quiz2|outlook)
  --data='...'           Block data as JSON object
  --data-base64="..."    Block data as Base64-encoded JSON (avoids shell escaping)
  --data-stdin           Read block data from stdin (use with heredoc or pipe)
  --position=N           Insert position (for create)
  --operation="..."      Bulk operation type (update|delete)
  --blocks='[...]'       Blocks array for bulk operation
  --blocks-base64="..."  Blocks array as Base64-encoded JSON
  --blocks-stdin         Read blocks array from stdin
  --confirm              Confirm deletion

SECTION NAMES:
  A lesson consists of these sections in order:
  1. hook                - Introduction/Hook
  2. learningObjectives  - Learning objectives
  3. transition          - Transition
  4. knowledge1          - First knowledge section (can have multiple blocks)
  5. quiz1               - First quiz
  6. knowledge2          - Second knowledge section (can have multiple blocks)
  7. quiz2               - Second quiz
  8. outlook             - Summary and outlook

JSON INPUT METHODS (for complex data with newlines/special chars):
  # Method 1: Base64 encoding (recommended for scripts)
  echo '{"title":"Test","content":"Line 1\\n\\nLine 2"}' | base64
  lernplattform blocks create lesson --type="textBlock" --section="hook" --data-base64="eyJ0aXRsZSI6..."

  # Method 2: Heredoc (recommended for interactive use)
  lernplattform blocks create lesson --type="textBlock" --section="hook" --data-stdin <<'EOF'
  {
    "title": "Mein Titel",
    "content": "Zeile 1\\n\\nZeile 2 mit Umlaut: oe"
  }
  EOF

  # Method 3: Pipe from file
  cat block-data.json | lernplattform blocks create lesson --type="textBlock" --section="hook" --data-stdin

WORKFLOWS (verkettet mit anderen Bereichen):

  Block-IDs in aktueller Reihenfolge ermitteln, dann gezielt umsortieren:
    IDS=$(lernplattform blocks list sql-grundlagen 2>/dev/null \\
      | jq -r 'sort_by(.position) | .[].id' | paste -sd, -)
    echo "Aktuelle Reihenfolge: $IDS"
    # Reorder mit angepasster Liste (alle IDs angeben, kein Partial-Reorder):
    lernplattform blocks reorder sql-grundlagen "id1,id3,id2,id4,id5"

  Alle Quiz-Blocks einer Lesson finden:
    lernplattform blocks list sql-grundlagen \\
      | jq '.[] | select(.type=="interactiveQuiz") | {id, section}'

  Bild hochladen und in Block einsetzen:
    URL=$(lernplattform image-upload ./diagram.png --json 2>/dev/null | jq -r '.url')
    lernplattform blocks update sql-grundlagen abc123 \\
      --data="{\\"content\\":\\"![Diagramm](${URL})\\"}"

OUTPUT:
  stdout = reines JSON aus der API. stderr = Status-/Debug-Logs.
  Exit 0 = Erfolg. Exit 1 = stderr enthaelt {"error": "..."}.
  Use jq for custom formatting:
    lernplattform blocks list lesson | jq '.[] | select(.type == "interactiveQuiz")'
    lernplattform blocks get lesson id | jq '.data'
`);
}

// src/commands/learning-path.ts
function getApiBaseUrl4() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/learning-paths`;
}
function getAuthToken4() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry4(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listLearningPaths(page, perPage, token) {
  const url = `${getApiBaseUrl4()}?page=${page}&per_page=${perPage}`;
  const startTime = Date.now();
  console.error(`
Listing learning paths from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry4(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getLearningPath(slug, token) {
  const url = `${getApiBaseUrl4()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Getting learning path from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry4(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createLearningPath(data, token) {
  const url = getApiBaseUrl4();
  const startTime = Date.now();
  console.error(`
Creating learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry4(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateLearningPath(slug, data, token) {
  const url = `${getApiBaseUrl4()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Updating learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry4(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteLearningPath(slug, token) {
  const url = `${getApiBaseUrl4()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Deleting learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry4(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function run4(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp4();
      return;
    }
    const token = getAuthToken4();
    let result;
    switch (operation) {
      case "list": {
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        const perPage = parseInt(getOptionalFlag(args, "per-page", "20"), 10);
        result = await listLearningPaths(page, perPage, token);
        break;
      }
      case "get": {
        const slug = getRequiredArg(args, 0, "slug");
        result = await getLearningPath(slug, token);
        if (args.flags["save-to-file"]) {
          const filepath = saveToFile("path", slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }
      case "create": {
        const title = getOptionalFlag(args, "title");
        const slug = getOptionalFlag(args, "slug");
        const status = getOptionalFlag(args, "status", "draft");
        if (!title || !slug) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--title", "--slug"],
            optional: ["--status (default: draft)", "--description", "--image-url", "--access-duration", "--price-id"]
          }, null, 2));
          process.exit(1);
        }
        const createData = {
          title,
          slug,
          editorial_status: status
        };
        if (args.flags.description) createData.description = args.flags.description;
        if (args.flags["image-url"]) createData.image_url = args.flags["image-url"];
        if (args.flags["is-preview"] !== void 0) {
          createData.is_preview = args.flags["is-preview"] === "true" || args.flags["is-preview"] === true;
        }
        if (args.flags["price-id"]) createData.stripe_price_id = args.flags["price-id"];
        if (args.flags["access-duration"]) {
          createData.access_duration_months = parseInt(args.flags["access-duration"], 10);
        }
        result = await createLearningPath(createData, token);
        break;
      }
      case "update": {
        const slug = getRequiredArg(args, 0, "slug");
        const updateData = {};
        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags["image-url"]) updateData.image_url = args.flags["image-url"];
        if (args.flags["is-preview"] !== void 0) {
          updateData.is_preview = args.flags["is-preview"] === "true" || args.flags["is-preview"] === true;
        }
        if (args.flags["price-id"]) updateData.stripe_price_id = args.flags["price-id"];
        if (args.flags["access-duration"]) {
          updateData.access_duration_months = parseInt(args.flags["access-duration"], 10);
        }
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--title", "--description", "--status", "--image-url", "--is-preview", "--price-id", "--access-duration"]
          }, null, 2));
          process.exit(1);
        }
        result = await updateLearningPath(slug, updateData, token);
        break;
      }
      case "delete": {
        const slug = getRequiredArg(args, 0, "slug");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteLearningPath(slug, token);
        result = { success: true, message: "Learning path deleted successfully" };
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp4() {
  console.log(`Learning Path CLI - Manage learning paths

USAGE:
  lernplattform path <operation> [args] [flags]

OPERATIONS:
  list                List all learning paths
  get <slug>          Get a specific learning path with all modules
  create              Create a new learning path
  update <slug>       Update an existing learning path
  delete <slug>       Delete a learning path (requires --confirm)

EXAMPLES:

  List Learning Paths:
    lernplattform path list
    lernplattform path list --page=2 --per-page=10
    lernplattform path list --json

  Get Learning Path:
    lernplattform path get ap-teil-2-fisi
    lernplattform path get ap-teil-2-fisi --json
    lernplattform path get ap-teil-2-fisi --save-to-file

  Create Learning Path:
    lernplattform path create \\
      --title="AP Teil 2 FISI" \\
      --slug="ap-teil-2-fisi" \\
      --status="published"

    lernplattform path create \\
      --title="Schnupperkurs JavaScript" \\
      --slug="schnupperkurs-javascript" \\
      --status="published" \\
      --description="Lerne die Grundlagen von JavaScript" \\
      --is-preview=true

    lernplattform path create \\
      --title="Premium SQL Kurs" \\
      --slug="premium-sql" \\
      --status="published" \\
      --price-id="price_1234567890" \\
      --access-duration=6

  Update Learning Path:
    lernplattform path update ap-teil-2-fisi --title="AP Teil 2 FISI (2025)"

    lernplattform path update schnupperkurs-javascript \\
      --title="JavaScript Crashkurs" \\
      --description="Schnelleinstieg in JavaScript" \\
      --status="published"

    lernplattform path update premium-sql --price-id="price_0987654321"

  Delete Learning Path:
    lernplattform path delete old-path --confirm

FLAGS:

  Pagination (list):
    --page=N              Page number (default: 1)
    --per-page=N          Items per page (default: 20)

  Create (required):
    --title="..."         Learning path title
    --slug="..."          Unique slug identifier
    --status="..."        Editorial status (draft|review|published)

  Create/Update (optional):
    --description="..."   Learning path description
    --image-url="..."     Cover image URL
    --is-preview=true     Is this a free preview path? (true/false)
    --price-id="..."      Stripe price ID for paid access
    --access-duration=N   Access duration in months (for paid paths)

  General:
    --save-to-file        Save response to backups/ directory (for get)
    --confirm             Confirm deletion (required for delete)
    --json                Output raw JSON
    --help                Show this help message

WORKFLOWS (verkettet mit anderen Bereichen):

  Kompletten Lernpfad aufbauen (3 Bereiche, gleiche Reihenfolge wie das Datenmodell):
    # 1) Lernpfad anlegen
    lernplattform path create --title="FIAE AP2" --slug="fiae-ap2" --status=draft
    # 2) Bereits existierende Module dem Lernpfad zuordnen (Modul-IDs aus module list/get)
    MOD_DB=$(lernplattform module get relationale-datenbanken 2>/dev/null | jq '.id')
    MOD_NET=$(lernplattform module get netzwerke 2>/dev/null | jq '.id')
    lernplattform path-modules create fiae-ap2 --module-id="$MOD_DB" --position=0
    lernplattform path-modules create fiae-ap2 --module-id="$MOD_NET" --position=1
    # 3) Pruefen ('path get' liefert Felder direkt am Root, inkl. .modules)
    lernplattform path get fiae-ap2 | jq '.modules[] | {id, title, position}'

  Alle Module eines Lernpfads listen (zum Reorder vorbereiten):
    lernplattform path-modules list fiae-ap2 \\
      | jq -r '.data | sort_by(.position) | .[].id' | paste -sd, -

OUTPUT:
  stdout = reines JSON aus der API. stderr = Status-/Debug-Logs.
  Exit 0 = Erfolg. Exit 1 = stderr enthaelt {"error": "..."}.

NOTES:
  - Alle learning-path-Befehle geben JSON auf stdout aus
  - Status-/Debug-Meldungen gehen auf stderr (mit 2>/dev/null ausblenden fuer Pipes)
  - Use --save-to-file with 'get' to backup before changes
  - Backup location: backups/path/path_{slug}_{timestamp}.json
  - The 'get' operation includes all modules in the learning path
  - Verwende 'lernplattform path-modules ...' fuer Modulzuordnungen, nicht 'path' selbst
`);
}

// src/commands/learning-path-module.ts
function getApiBaseUrl5(learningPathSlug) {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/learning-paths/${learningPathSlug}/modules`;
}
function getAuthToken5() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry5(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listModules2(learningPathSlug, token) {
  const url = getApiBaseUrl5(learningPathSlug);
  const startTime = Date.now();
  console.error(`
Listing modules from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry5(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createModule2(learningPathSlug, moduleId, position, token) {
  const url = getApiBaseUrl5(learningPathSlug);
  const startTime = Date.now();
  const payload = {
    module_id: moduleId
  };
  if (position !== void 0) {
    payload.position = position;
  }
  console.error(`
Adding module to learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Payload: ${JSON.stringify(payload)}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry5(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteModule2(learningPathSlug, moduleSlug, token) {
  const url = `${getApiBaseUrl5(learningPathSlug)}/${moduleSlug}`;
  const startTime = Date.now();
  console.error(`
Removing module from learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry5(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function bulkAddModules(learningPathSlug, moduleIds, token) {
  const url = `${getApiBaseUrl5(learningPathSlug)}/bulk`;
  const startTime = Date.now();
  const payload = { module_ids: moduleIds };
  console.error(`
Bulk adding modules to learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Module IDs: ${moduleIds.join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry5(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function reorderModules(learningPathSlug, moduleIds, token) {
  const url = `${getApiBaseUrl5(learningPathSlug)}/reorder`;
  const startTime = Date.now();
  const payload = { module_ids: moduleIds };
  console.error(`
Reordering modules in learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Module IDs: ${moduleIds.join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry5(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run5(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp5();
      return;
    }
    const token = getAuthToken5();
    let result;
    switch (operation) {
      case "list": {
        const learningPathSlug = getRequiredArg(args, 0, "learning-path-slug");
        result = await listModules2(learningPathSlug, token);
        break;
      }
      case "create": {
        const learningPathSlug = getRequiredArg(args, 0, "learning-path-slug");
        const moduleIdStr = getOptionalFlag(args, "module-id");
        const positionStr = getOptionalFlag(args, "position");
        if (!moduleIdStr) {
          console.error(JSON.stringify({
            error: "Missing required field",
            required: ["--module-id"],
            optional: ["--position"]
          }, null, 2));
          process.exit(1);
        }
        const moduleId = parseInt(moduleIdStr, 10);
        if (isNaN(moduleId)) {
          throw new Error("--module-id must be a number");
        }
        const position = positionStr !== void 0 ? parseInt(positionStr, 10) : void 0;
        result = await createModule2(learningPathSlug, moduleId, position, token);
        break;
      }
      case "delete": {
        const learningPathSlug = getRequiredArg(args, 0, "learning-path-slug");
        const moduleSlug = getRequiredArg(args, 1, "module-slug");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteModule2(learningPathSlug, moduleSlug, token);
        result = { success: true, message: "Module removed from learning path successfully" };
        break;
      }
      case "bulk": {
        const learningPathSlug = getRequiredArg(args, 0, "learning-path-slug");
        const moduleIds = getJsonData(args, "module-ids");
        if (!moduleIds) {
          console.error(JSON.stringify({
            error: "Missing required field",
            required: ["--module-ids (JSON array of integers)"],
            example: "--module-ids='[1, 2, 3]'",
            alternatives: {
              "--module-ids-base64": "Base64-encoded JSON array",
              "--module-ids-stdin": "Read JSON array from stdin"
            }
          }, null, 2));
          process.exit(1);
        }
        if (!Array.isArray(moduleIds) || !moduleIds.every((id) => typeof id === "number")) {
          throw new Error("--module-ids must be an array of integers");
        }
        result = await bulkAddModules(learningPathSlug, moduleIds, token);
        break;
      }
      case "reorder": {
        const learningPathSlug = getRequiredArg(args, 0, "learning-path-slug");
        const moduleIdsArg = getRequiredArg(args, 1, "module-ids (comma-separated)");
        const moduleIds = moduleIdsArg.split(",").map((id) => {
          const parsed = parseInt(id.trim(), 10);
          if (isNaN(parsed)) {
            throw new Error(`Invalid module ID: ${id}`);
          }
          return parsed;
        });
        result = await reorderModules(learningPathSlug, moduleIds, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "create", "delete", "bulk", "reorder"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp5() {
  console.log(`Learning Path Modules CLI - Manage modules within learning paths

DESCRIPTION:
  Learning path modules link modules to learning paths and define their order.
  This CLI manages these associations and their ordering.

USAGE:
  lernplattform path-modules <operation> <learning-path-slug> [args] [flags]

OPERATIONS:
  list <learning-path-slug>                    List all modules in a learning path
  create <learning-path-slug>                  Add module to learning path
  delete <learning-path-slug> <module-slug>    Remove module (requires --confirm)
  bulk <learning-path-slug>                    Bulk add modules
  reorder <learning-path-slug> <ids>           Reorder modules (comma-separated IDs)

EXAMPLES:
  # List modules in a learning path
  lernplattform path-modules list ap-teil-2-pruefung

  # Add a module to learning path
  lernplattform path-modules create ap-teil-2-pruefung \\
    --module-id=123 \\
    --position=0

  # Add a module without specific position (appends to end)
  lernplattform path-modules create ap-teil-2-pruefung --module-id=456

  # Remove module from learning path
  lernplattform path-modules delete ap-teil-2-pruefung relationale-datenbanken --confirm

  # Bulk add modules to learning path
  lernplattform path-modules bulk ap-teil-2-pruefung \\
    --module-ids='[1, 2, 3, 4, 5]'

  # Reorder all modules (must include ALL module IDs)
  lernplattform path-modules reorder ap-teil-2-pruefung 5,3,1,4,2

FLAGS:
  --module-id=N                Module ID to add
  --module-ids='[...]'         JSON array of module IDs for bulk operation
  --module-ids-base64="..."    JSON array as Base64-encoded
  --module-ids-stdin           Read JSON array from stdin
  --position=N                 Position in learning path (0-based)
  --confirm                    Confirm deletion

OUTPUT:
  All commands return raw JSON from the API.

RESPONSE FORMAT (list):
  {
    "data": [
      {
        "id": 122,
        "title": "Relationale Datenbanken",
        "slug": "relationale-datenbanken",
        "description": "...",
        "type": "normal",
        "editorial_status": "published",
        "position": 0,
        "created_at": "2025-01-15T10:30:00+00:00",
        "updated_at": "2025-01-15T10:30:00+00:00"
      }
    ],
    "current_page": 1,
    "last_page": 1,
    "per_page": 15,
    "total": 5
  }

RESPONSE FORMAT (bulk):
  {
    "added": 5,
    "modules": [...]
  }

RESPONSE FORMAT (reorder):
  {
    "message": "Modules reordered successfully"
  }

NOTES:
  - When reordering, you MUST include ALL module IDs for the learning path
  - Partial reordering is not supported
  - A module can only be added to a learning path once (unique constraint)
`);
}

// src/commands/module-content-item.ts
function getApiBaseUrl6(moduleSlug) {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/modules/${moduleSlug}/content-items`;
}
function getAuthToken6() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry6(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listContentItems(moduleSlug, token) {
  const url = getApiBaseUrl6(moduleSlug);
  const startTime = Date.now();
  console.error(`
Listing content items from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getContentItem(moduleSlug, itemId, token) {
  const url = `${getApiBaseUrl6(moduleSlug)}/${itemId}`;
  const startTime = Date.now();
  console.error(`
Getting content item from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createContentItem(moduleSlug, contentType, contentId, position, includedInPrimaryFlow, token) {
  const url = getApiBaseUrl6(moduleSlug);
  const startTime = Date.now();
  const payload = {
    content_type: contentType,
    content_id: contentId
  };
  if (position !== void 0) {
    payload.position = position;
  }
  if (includedInPrimaryFlow !== void 0) {
    payload.included_in_primary_flow = includedInPrimaryFlow;
  }
  console.error(`
Creating content item via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Payload: ${JSON.stringify(payload)}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateContentItem(moduleSlug, itemId, position, includedInPrimaryFlow, token) {
  const url = `${getApiBaseUrl6(moduleSlug)}/${itemId}`;
  const startTime = Date.now();
  const payload = {};
  if (position !== void 0) {
    payload.position = position;
  }
  if (includedInPrimaryFlow !== void 0) {
    payload.included_in_primary_flow = includedInPrimaryFlow;
  }
  console.error(`
Updating content item via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Payload: ${JSON.stringify(payload)}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteContentItem(moduleSlug, itemId, token) {
  const url = `${getApiBaseUrl6(moduleSlug)}/${itemId}`;
  const startTime = Date.now();
  console.error(`
Deleting content item via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function bulkCreateContentItems(moduleSlug, items, token) {
  const url = `${getApiBaseUrl6(moduleSlug)}/bulk`;
  const startTime = Date.now();
  const payload = { items };
  console.error(`
Bulk creating content items via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Items count: ${items.length}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function reorderContentItems(moduleSlug, itemIds, token) {
  const url = `${getApiBaseUrl6(moduleSlug)}/reorder`;
  const startTime = Date.now();
  const payload = { item_ids: itemIds };
  console.error(`
Reordering content items via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Item IDs: ${itemIds.join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry6(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run6(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp6();
      return;
    }
    const token = getAuthToken6();
    let result;
    switch (operation) {
      case "list": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        result = await listContentItems(moduleSlug, token);
        break;
      }
      case "get": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const itemId = parseInt(getRequiredArg(args, 1, "item-id"), 10);
        if (isNaN(itemId)) {
          throw new Error("item-id must be a number");
        }
        result = await getContentItem(moduleSlug, itemId, token);
        break;
      }
      case "create": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const contentType = getOptionalFlag(args, "content-type");
        const contentIdStr = getOptionalFlag(args, "content-id");
        const positionStr = getOptionalFlag(args, "position");
        const includedInPrimaryFlowStr = getOptionalFlag(args, "included-in-primary-flow");
        if (!contentType || !contentIdStr) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--content-type (lesson|video|practice_task)", "--content-id"],
            optional: ["--position", "--included-in-primary-flow"]
          }, null, 2));
          process.exit(1);
        }
        const contentId = parseInt(contentIdStr, 10);
        if (isNaN(contentId)) {
          throw new Error("--content-id must be a number");
        }
        const position = positionStr !== void 0 ? parseInt(positionStr, 10) : void 0;
        const includedInPrimaryFlow = includedInPrimaryFlowStr !== void 0 ? includedInPrimaryFlowStr === "true" || includedInPrimaryFlowStr === true : void 0;
        result = await createContentItem(
          moduleSlug,
          contentType,
          contentId,
          position,
          includedInPrimaryFlow,
          token
        );
        break;
      }
      case "update": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const itemId = parseInt(getRequiredArg(args, 1, "item-id"), 10);
        if (isNaN(itemId)) {
          throw new Error("item-id must be a number");
        }
        const positionStr = getOptionalFlag(args, "position");
        const includedInPrimaryFlowStr = getOptionalFlag(args, "included-in-primary-flow");
        if (positionStr === void 0 && includedInPrimaryFlowStr === void 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--position", "--included-in-primary-flow"]
          }, null, 2));
          process.exit(1);
        }
        const position = positionStr !== void 0 ? parseInt(positionStr, 10) : void 0;
        const includedInPrimaryFlow = includedInPrimaryFlowStr !== void 0 ? includedInPrimaryFlowStr === "true" || includedInPrimaryFlowStr === true : void 0;
        result = await updateContentItem(
          moduleSlug,
          itemId,
          position,
          includedInPrimaryFlow,
          token
        );
        break;
      }
      case "delete": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const itemId = parseInt(getRequiredArg(args, 1, "item-id"), 10);
        if (isNaN(itemId)) {
          throw new Error("item-id must be a number");
        }
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteContentItem(moduleSlug, itemId, token);
        result = { success: true, message: "Content item deleted successfully" };
        break;
      }
      case "bulk": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const items = getJsonData(args, "items");
        if (!items) {
          console.error(JSON.stringify({
            error: "Missing required field",
            required: ["--items (JSON array)"],
            example: `--items='[{"content_type":"lesson","content_id":123},{"content_type":"video","content_id":456}]'`,
            alternatives: {
              "--items-base64": "Base64-encoded JSON array (avoids shell escaping)",
              "--items-stdin": "Read JSON array from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        result = await bulkCreateContentItems(moduleSlug, items, token);
        break;
      }
      case "reorder": {
        const moduleSlug = getRequiredArg(args, 0, "module-slug");
        const itemIdsArg = getRequiredArg(args, 1, "item-ids (comma-separated)");
        const itemIds = itemIdsArg.split(",").map((id) => {
          const parsed = parseInt(id.trim(), 10);
          if (isNaN(parsed)) {
            throw new Error(`Invalid item ID: ${id}`);
          }
          return parsed;
        });
        result = await reorderContentItems(moduleSlug, itemIds, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete", "bulk", "reorder"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp6() {
  console.log(`Module Content Items CLI - Manage content items within modules

DESCRIPTION:
  Content items link content (lessons, videos, practice tasks) to modules.
  This CLI manages these associations and their ordering.

USAGE:
  lernplattform content-items <operation> <module-slug> [args] [flags]

OPERATIONS:
  list <module-slug>                    List all content items in a module
  get <module-slug> <item-id>           Get a specific content item
  create <module-slug>                  Add content item to module
  update <module-slug> <item-id>        Update content item
  delete <module-slug> <item-id>        Remove content item (requires --confirm)
  bulk <module-slug>                    Bulk add content items
  reorder <module-slug> <ids>           Reorder content items (comma-separated IDs)

CONTENT TYPES (content_type_key in der API-Response):
  lesson        - Lesson content
  video         - Video content
  practice_task - Practice task content
  lab           - Lab content (Hands-on-Uebungen)

  Zum Filtern in jq nach Typ:
    lernplattform content-items list <modul> | jq '.data[] | select(.content_type_key=="lesson")'

EXAMPLES:
  # List content items in a module
  lernplattform content-items list relationale-datenbanken

  # Get specific content item
  lernplattform content-items get relationale-datenbanken 42

  # Add a lesson to module
  lernplattform content-items create relationale-datenbanken \\
    --content-type="lesson" \\
    --content-id=123 \\
    --position=0 \\
    --included-in-primary-flow=true

  # Add a video to module
  lernplattform content-items create relationale-datenbanken \\
    --content-type="video" \\
    --content-id=456

  # Add a practice task
  lernplattform content-items create relationale-datenbanken \\
    --content-type="practice_task" \\
    --content-id=789

  # Update content item position
  lernplattform content-items update relationale-datenbanken 42 --position=5

  # Update included_in_primary_flow
  lernplattform content-items update relationale-datenbanken 42 --included-in-primary-flow=false

  # Update both position and included_in_primary_flow
  lernplattform content-items update relationale-datenbanken 42 \\
    --position=3 --included-in-primary-flow=true

  # Remove content item from module
  lernplattform content-items delete relationale-datenbanken 42 --confirm

  # Bulk add content items (inline JSON)
  lernplattform content-items bulk relationale-datenbanken \\
    --items='[
      {"content_type":"lesson","content_id":1,"position":0},
      {"content_type":"video","content_id":2,"position":1},
      {"content_type":"practice_task","content_id":3,"position":2}
    ]'

  # Bulk add content items (heredoc - recommended for complex JSON)
  lernplattform content-items bulk my-module --items-stdin <<'EOF'
  [
    {"content_type":"lesson","content_id":123,"position":0},
    {"content_type":"video","content_id":456,"position":1},
    {"content_type":"practice_task","content_id":789,"position":2}
  ]
  EOF

  # Reorder all content items (must include ALL item IDs)
  lernplattform content-items reorder relationale-datenbanken 5,3,1,4,2

FLAGS:
  --content-type="..."           Content type (lesson|video|practice_task)
  --content-id=N                 Content ID to link
  --position=N                   Position in module (0-based)
  --included-in-primary-flow     Include in primary learning flow (true|false)
  --items='[...]'                JSON array for bulk operation
  --items-base64="..."           JSON array as Base64-encoded (avoids shell escaping)
  --items-stdin                  Read JSON array from stdin (use with heredoc or pipe)
  --confirm                      Confirm deletion

OUTPUT:
  All commands return raw JSON from the API.

RESPONSE FORMATS:

  Single Item (list, get, create, update):
  {
    "id": 42,
    "module_id": 122,
    "content_type": "App\\\\Models\\\\Lesson",
    "content_type_key": "lesson",
    "content_id": 123,
    "position": 0,
    "included_in_primary_flow": true,
    "content_title": "SQL Grundlagen",
    "content_slug": "sql-grundlagen",
    "created_at": "2025-01-15T10:30:00+00:00",
    "updated_at": "2025-01-15T10:30:00+00:00"
  }

  Bulk Create Response:
  {
    "created": 3,
    "items": [
      {
        "id": 42,
        "module_id": 122,
        "content_type": "App\\\\Models\\\\Lesson",
        "content_type_key": "lesson",
        "content_id": 123,
        "position": 0,
        "included_in_primary_flow": true,
        "content_title": "SQL Grundlagen",
        "content_slug": "sql-grundlagen",
        "created_at": "2025-01-15T10:30:00+00:00",
        "updated_at": "2025-01-15T10:30:00+00:00"
      }
    ]
  }

  Reorder Response:
  {
    "message": "Content items reordered successfully"
  }

  List Response:
  {
    "data": [...items...],
    "current_page": 1,
    "last_page": 1,
    "per_page": 15,
    "total": 5
  }

NOTES:
  - When reordering, you MUST include ALL item IDs for the module
  - Partial reordering is not supported
  - Content items are unique per module (same content can't be added twice)
`);
}

// src/commands/practice-task.ts
function getApiBaseUrl7() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/practice-tasks`;
}
function getAuthToken7() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry7(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listPracticeTasks(page, perPage, moduleId, searchQuery, token) {
  let url = `${getApiBaseUrl7()}?page=${page}&per_page=${perPage}`;
  if (moduleId !== void 0) {
    url += `&module_id=${moduleId}`;
  }
  if (searchQuery) {
    url += `&search=${encodeURIComponent(searchQuery)}`;
  }
  const startTime = Date.now();
  console.error(`
Listing practice tasks from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry7(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getPracticeTask(slug, token) {
  const url = `${getApiBaseUrl7()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Getting practice task from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry7(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createPracticeTask(data, token) {
  const url = getApiBaseUrl7();
  const startTime = Date.now();
  console.error(`
Creating practice task via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry7(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updatePracticeTask(slug, data, token) {
  const url = `${getApiBaseUrl7()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Updating practice task via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry7(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deletePracticeTask(slug, token) {
  const url = `${getApiBaseUrl7()}/${slug}`;
  const startTime = Date.now();
  console.error(`
Deleting practice task via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry7(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function run7(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp7();
      return;
    }
    const token = getAuthToken7();
    let result;
    switch (operation) {
      case "list": {
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        const perPage = parseInt(getOptionalFlag(args, "per-page", "20"), 10);
        const moduleIdStr = getOptionalFlag(args, "module-id");
        const moduleId = moduleIdStr ? parseInt(moduleIdStr, 10) : void 0;
        const searchQuery = getOptionalFlag(args, "search");
        result = await listPracticeTasks(page, perPage, moduleId, searchQuery, token);
        break;
      }
      case "get": {
        const slug = getRequiredArg(args, 0, "slug");
        result = await getPracticeTask(slug, token);
        if (args.flags["save-to-file"]) {
          const filepath = saveToFile("practice", slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }
      case "create": {
        const title = getOptionalFlag(args, "title");
        const slug = getOptionalFlag(args, "slug");
        if (!title || !slug) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--title", "--slug"],
            optional: ["--description", "--task-markdown", "--solution-markdown", "--difficulty", "--module-id"]
          }, null, 2));
          process.exit(1);
        }
        const createData = {
          title,
          slug
        };
        if (args.flags.description) createData.description = args.flags.description;
        const taskMarkdown = getTextData(args, "task-markdown");
        if (taskMarkdown) createData.task_markdown = taskMarkdown;
        const solutionMarkdown = getTextData(args, "solution-markdown");
        if (solutionMarkdown) createData.solution_markdown = solutionMarkdown;
        if (args.flags.difficulty) createData.schwierigkeitsgrad = args.flags.difficulty;
        if (args.flags["module-id"]) {
          createData.module_id = parseInt(args.flags["module-id"], 10);
        }
        if (args.flags["content-type"]) createData.content_type = args.flags["content-type"];
        result = await createPracticeTask(createData, token);
        break;
      }
      case "update": {
        const slug = getRequiredArg(args, 0, "slug");
        const updateData = {};
        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        const taskMarkdown = getTextData(args, "task-markdown");
        if (taskMarkdown) updateData.task_markdown = taskMarkdown;
        const solutionMarkdown = getTextData(args, "solution-markdown");
        if (solutionMarkdown) updateData.solution_markdown = solutionMarkdown;
        if (args.flags.difficulty) updateData.schwierigkeitsgrad = args.flags.difficulty;
        if (args.flags["module-id"]) {
          updateData.module_id = parseInt(args.flags["module-id"], 10);
        }
        if (args.flags["content-type"]) updateData.content_type = args.flags["content-type"];
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--title", "--description", "--task-markdown", "--solution-markdown", "--difficulty", "--module-id"]
          }, null, 2));
          process.exit(1);
        }
        result = await updatePracticeTask(slug, updateData, token);
        break;
      }
      case "delete": {
        const slug = getRequiredArg(args, 0, "slug");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deletePracticeTask(slug, token);
        result = { success: true, message: "Practice task deleted successfully" };
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp7() {
  console.log(`Practice Task CLI - Manage practice tasks

USAGE:
  lernplattform practice <operation> [args] [flags]

OPERATIONS:
  list                List all practice tasks
  get <slug>          Get a specific practice task
  create              Create a new practice task
  update <slug>       Update an existing practice task
  delete <slug>       Delete a practice task (requires --confirm)

EXAMPLES:

  List Practice Tasks:
    lernplattform practice list
    lernplattform practice list --page=2 --per-page=10
    lernplattform practice list --module-id=17
    lernplattform practice list --search="nslookup"
    lernplattform practice list --module-id=17 --search="DNS"

  Get Practice Task:
    lernplattform practice get anwendung-von-nslookup
    lernplattform practice get task-slug --save-to-file

  Create Practice Task (Basic):
    lernplattform practice create \\
      --title="DNS Troubleshooting mit nslookup" \\
      --slug="dns-troubleshooting-nslookup" \\
      --module-id=17 \\
      --difficulty="mittel" \\
      --description="Lerne DNS-Probleme mit nslookup zu diagnostizieren"

  Create Practice Task with Markdown Content (Heredoc):
    lernplattform practice create \\
      --title="Arrays sortieren" \\
      --slug="arrays-sortieren" \\
      --module-id=5 \\
      --difficulty="einfach" \\
      --task-markdown-stdin \\
      --solution-markdown-stdin <<'TASK_EOF' <<'SOLUTION_EOF'
    # Aufgabe: Arrays sortieren

    Erstelle ein Programm, das ein Array von Zahlen sortiert.

    ## Anforderungen
    - Nutze einen Sortieralgorithmus deiner Wahl
    - Das Array soll aufsteigend sortiert werden
    - Gib das sortierte Array aus
    TASK_EOF
    # L\xF6sung

    \`\`\`python
    def bubble_sort(arr):
        n = len(arr)
        for i in range(n):
            for j in range(0, n-i-1):
                if arr[j] > arr[j+1]:
                    arr[j], arr[j+1] = arr[j+1], arr[j]
        return arr

    numbers = [64, 34, 25, 12, 22, 11, 90]
    sorted_numbers = bubble_sort(numbers)
    print(sorted_numbers)
    \`\`\`
    SOLUTION_EOF

  Create Practice Task with Base64 Encoding:
    TASK_CONTENT=$(cat <<'EOF' | base64
    # Aufgabe: REST API implementieren
    Erstelle eine REST API mit Express.js.
    EOF
    )
    SOLUTION_CONTENT=$(cat <<'EOF' | base64
    # L\xF6sung
    \`\`\`javascript
    const express = require('express');
    const app = express();
    app.get('/api/users', (req, res) => {
      res.json([{id: 1, name: 'Max'}]);
    });
    app.listen(3000);
    \`\`\`
    EOF
    )
    lernplattform practice create \\
      --title="REST API mit Express" \\
      --slug="rest-api-express" \\
      --module-id=10 \\
      --difficulty="schwer" \\
      --task-markdown-base64="$TASK_CONTENT" \\
      --solution-markdown-base64="$SOLUTION_CONTENT"

  Update Practice Task:
    lernplattform practice update dns-troubleshooting --difficulty="schwer"
    lernplattform practice update task-slug --title="Neuer Titel"
    lernplattform practice update task-slug -- \\
      --description="Aktualisierte Beschreibung" \\
      --difficulty="einfach"

  Update Task Content with Heredoc:
    lernplattform practice update arrays-sortieren --task-markdown-stdin <<'EOF'
    # Aktualisierte Aufgabe

    Implementiere Quicksort statt Bubblesort.
    EOF

  Delete Practice Task:
    lernplattform practice delete old-task --confirm

  Backup Before Changes:
    lernplattform practice get my-task --save-to-file

FLAGS:
  List Operation:
    --page=N                        Page number (default: 1)
    --per-page=N                    Items per page (default: 20)
    --module-id=N                   Filter by module ID
    --search="..."                  Search query (searches title and description)

  Create/Update Operations:
    --title="..."                   Task title (required for create)
    --slug="..."                    Task slug (required for create)
    --description="..."             Task description
    --module-id=N                   Module ID to link task to
    --difficulty="..."              Difficulty level:
                                      - einfach (easy)
                                      - mittel (medium)
                                      - schwer (hard)

  Task Content (Markdown):
    --task-markdown="..."           Task content as inline string
    --task-markdown-base64="..."    Task content as Base64-encoded string
    --task-markdown-stdin           Read task content from stdin (heredoc/pipe)

  Solution Content (Markdown):
    --solution-markdown="..."       Solution content as inline string
    --solution-markdown-base64="..." Solution content as Base64-encoded string
    --solution-markdown-stdin       Read solution content from stdin (heredoc/pipe)

  Other:
    --save-to-file                  Save response to backups/practice/ (for get)
    --confirm                       Confirm deletion (required for delete)

INPUT PRIORITY:
  For both task-markdown and solution-markdown:
    1. stdin (--task-markdown-stdin) - Highest priority
    2. Base64 (--task-markdown-base64)
    3. Inline (--task-markdown) - Lowest priority

BACKUP LOCATION:
  backups/practice/practice_<slug>_<timestamp>.json

DIFFICULTY LEVELS:
  einfach - Easy tasks for beginners
  mittel  - Medium difficulty for intermediate learners
  schwer  - Hard tasks for advanced learners

COMMON WORKFLOWS:

  1. Create Practice Task with Full Content:
     lernplattform practice create \\
       --title="Meine Aufgabe" \\
       --slug="meine-aufgabe" \\
       --module-id=5 \\
       --difficulty="mittel" \\
       --description="Kurze Beschreibung" \\
       --task-markdown-stdin \\
       --solution-markdown-stdin <<'TASK_EOF' <<'SOLUTION_EOF'
     # Aufgabe hier
     TASK_EOF
     # L\xF6sung hier
     SOLUTION_EOF

  2. Update Task Content from File:
     cat task-content.md | lernplattform practice update my-task --task-markdown-stdin
     cat solution.md | lernplattform practice update my-task --solution-markdown-stdin

  3. Backup Before Major Changes:
     lernplattform practice get my-task --save-to-file
     lernplattform practice update my-task --difficulty="schwer"

OUTPUT:
  Raw JSON from API.

TECHNICAL NOTES:
  - Requires AIDI_API_TOKEN in .env
  - API endpoint: {AIDI_HOST_URL}/api/content-cli/v1/practice-tasks
  - Timeout: 60 seconds per request
  - Retries: 3 attempts with exponential backoff
  - Markdown supports full Markdown syntax including code blocks
  - Use heredoc (<<'EOF') to prevent shell expansion of special characters
`);
}

// src/commands/practice-blocks.ts
function getApiBaseUrl8(practiceTaskSlug) {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/practice-tasks/${practiceTaskSlug}/blocks`;
}
function getAuthToken8() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry8(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listBlocks2(practiceTaskSlug, token) {
  const url = getApiBaseUrl8(practiceTaskSlug);
  const startTime = Date.now();
  console.error(`
Listing practice blocks from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getBlock2(practiceTaskSlug, blockId, token) {
  const url = `${getApiBaseUrl8(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Getting practice block from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createBlock2(practiceTaskSlug, data, token) {
  const url = getApiBaseUrl8(practiceTaskSlug);
  const startTime = Date.now();
  console.error(`
Creating practice block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateBlock2(practiceTaskSlug, blockId, data, token) {
  const url = `${getApiBaseUrl8(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Updating practice block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteBlock2(practiceTaskSlug, blockId, token) {
  const url = `${getApiBaseUrl8(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();
  console.error(`
Deleting practice block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function reorderBlocks2(practiceTaskSlug, blockIds, token) {
  const url = `${getApiBaseUrl8(practiceTaskSlug)}/reorder`;
  const startTime = Date.now();
  console.error(`
Reordering practice blocks via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Block IDs: ${blockIds.join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ block_ids: blockIds })
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function bulkOperation2(practiceTaskSlug, bulkOp, blocks, token) {
  const url = `${getApiBaseUrl8(practiceTaskSlug)}/bulk`;
  const startTime = Date.now();
  console.error(`
Bulk ${bulkOp} via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Operation: ${bulkOp}`);
  console.error(`   Block count: ${blocks.length}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry8(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ operation: bulkOp, blocks })
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run8(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help") {
      printHelp8();
      return;
    }
    const token = getAuthToken8();
    let result;
    switch (operation) {
      case "list": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        result = await listBlocks2(practiceTaskSlug, token);
        break;
      }
      case "get": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        result = await getBlock2(practiceTaskSlug, blockId, token);
        break;
      }
      case "create": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const type = getOptionalFlag(args, "type");
        const data = getJsonData(args, "data");
        if (!type || !data) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--type (free_text|multiple_choice|single_choice|task_description)", "--data (JSON object)"],
            optional: ["--position"],
            alternatives: {
              "--data-base64": "Base64-encoded JSON (avoids shell escaping)",
              "--data-stdin": "Read JSON from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        const createData = { type, data };
        if (args.flags.position !== void 0) {
          createData.position = parseInt(args.flags.position, 10);
        }
        result = await createBlock2(practiceTaskSlug, createData, token);
        break;
      }
      case "update": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        const updateData = {};
        if (args.flags.type) updateData.type = args.flags.type;
        const data = getJsonData(args, "data");
        if (data) updateData.data = data;
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--type", "--data"],
            alternatives: {
              "--data-base64": "Base64-encoded JSON (avoids shell escaping)",
              "--data-stdin": "Read JSON from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        result = await updateBlock2(practiceTaskSlug, blockId, updateData, token);
        break;
      }
      case "delete": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const blockId = getRequiredArg(args, 1, "block-id");
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteBlock2(practiceTaskSlug, blockId, token);
        result = { success: true, message: "Block deleted successfully" };
        break;
      }
      case "reorder": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const blockIdsArg = getRequiredArg(args, 1, "block-ids (comma-separated)");
        const blockIds = blockIdsArg.split(",").map((id) => id.trim());
        result = await reorderBlocks2(practiceTaskSlug, blockIds, token);
        break;
      }
      case "bulk": {
        const practiceTaskSlug = getRequiredArg(args, 0, "practice-task-slug");
        const bulkOp = getOptionalFlag(args, "operation", "update");
        const blocksData = getJsonData(args, "blocks");
        if (!blocksData) {
          console.error(JSON.stringify({
            error: "Missing required field",
            required: ["--blocks (JSON array)"],
            optional: ["--operation (update|delete, default: update)"],
            alternatives: {
              "--blocks-base64": "Base64-encoded JSON array (avoids shell escaping)",
              "--blocks-stdin": "Read JSON array from stdin (use with heredoc or pipe)"
            }
          }, null, 2));
          process.exit(1);
        }
        result = await bulkOperation2(practiceTaskSlug, bulkOp, blocksData, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "create", "update", "delete", "reorder", "bulk"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp8() {
  console.log(`Practice Blocks CLI - Manage practice task blocks

USAGE:
  lernplattform practice-blocks <operation> [args] [flags]

OPERATIONS:
  list <practice-task-slug>              List all blocks in a practice task
  get <practice-task-slug> <block-id>    Get a specific block
  create <practice-task-slug>            Create a new block
  update <practice-task-slug> <block-id> Update a block
  delete <practice-task-slug> <block-id> Delete a block (requires --confirm)
  reorder <practice-task-slug> <ids>     Reorder blocks (comma-separated IDs)
  bulk <practice-task-slug>              Bulk update/delete blocks

BLOCK TYPES:
  Practice tasks support these block types:

  task_description   - Aufgabenbeschreibung (keine Antwort erforderlich)
                       Ideal fuer Kontext, Anweisungen, Szenarien

  free_text          - Freitext mit KI-Validierung
                       Offene Fragen, die von KI bewertet werden

  single_choice      - Single Choice (eine Antwort richtig)
                       Klassische Multiple-Choice mit einer Loesung

  multiple_choice    - Multiple Choice (mehrere Antworten richtig)
                       Fragen mit mehreren korrekten Optionen

EXAMPLES:

  # List all blocks in a practice task
  lernplattform practice-blocks list dns-troubleshooting

  # Get specific block
  lernplattform practice-blocks get dns-troubleshooting abc123defg

  # Create task_description block (Aufgabenbeschreibung)
  lernplattform practice-blocks create dns-troubleshooting \\
    --type="task_description" \\
    --data='{
      "title": "Szenario: DNS-Probleme diagnostizieren",
      "content": "Ein Benutzer meldet, dass er die Webseite example.com nicht erreichen kann..."
    }'

  # Create single_choice block
  lernplattform practice-blocks create dns-troubleshooting \\
    --type="single_choice" \\
    --data='{
      "question": "Welcher DNS-Record-Typ wird fuer E-Mail-Server verwendet?",
      "options": ["A", "MX", "CNAME", "TXT"],
      "correct": 1
    }'

  # Create multiple_choice block
  lernplattform practice-blocks create dns-troubleshooting \\
    --type="multiple_choice" \\
    --data='{
      "question": "Welche der folgenden sind gueltige DNS-Record-Typen?",
      "options": ["A", "MX", "HTTP", "AAAA", "FTP"],
      "correct": [0, 1, 3]
    }'

  # Create free_text block (KI-validiert)
  lernplattform practice-blocks create dns-troubleshooting \\
    --type="free_text" \\
    --data='{
      "question": "Erklaere, wie DNS-Aufloesung funktioniert.",
      "expected_keywords": ["Resolver", "Root-Server", "TLD", "Authoritative"],
      "min_length": 50
    }'

  # Create with specific position
  lernplattform practice-blocks create dns-troubleshooting \\
    --type="task_description" \\
    --data='{"title":"Schritt 2","content":"..."}' \\
    --position=1

  # Update block data
  lernplattform practice-blocks update dns-troubleshooting abc123defg \\
    --data='{"question":"Aktualisierte Frage","options":["A","B","C"]}'

  # Change block type
  lernplattform practice-blocks update dns-troubleshooting abc123defg --type="multiple_choice"

  # Delete block
  lernplattform practice-blocks delete dns-troubleshooting abc123defg --confirm

  # Reorder blocks
  lernplattform practice-blocks reorder dns-troubleshooting abc123,xyz789,quiz456

  # Bulk update
  lernplattform practice-blocks bulk dns-troubleshooting \\
    --operation="update" \\
    --blocks='[
      {"id":"abc123","data":{"question":"Neue Frage 1"}},
      {"id":"xyz789","data":{"question":"Neue Frage 2"}}
    ]'

  # Bulk delete
  lernplattform practice-blocks bulk dns-troubleshooting \\
    --operation="delete" \\
    --blocks='[
      {"id":"abc123"},
      {"id":"xyz789"}
    ]'

FLAGS:
  --type="..."           Block type (free_text|multiple_choice|single_choice|task_description)
  --data='...'           Block data as JSON object
  --data-base64="..."    Block data as Base64-encoded JSON (avoids shell escaping)
  --data-stdin           Read block data from stdin (use with heredoc or pipe)
  --position=N           Insert position (for create)
  --operation="..."      Bulk operation type (update|delete)
  --blocks='[...]'       Blocks array for bulk operation
  --blocks-base64="..."  Blocks array as Base64-encoded JSON
  --blocks-stdin         Read blocks array from stdin
  --confirm              Confirm deletion

DATA STRUCTURES BY BLOCK TYPE:

  task_description:
    {
      "title": "Aufgabentitel",
      "content": "Markdown-Inhalt mit Beschreibung..."
    }

  single_choice:
    {
      "question": "Die Frage?",
      "options": ["Option A", "Option B", "Option C"],
      "correct": 0,                    // Index der richtigen Antwort
      "explanation": "Optional: Erklaerung"
    }

  multiple_choice:
    {
      "question": "Die Frage?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": [0, 2],               // Indices der richtigen Antworten
      "explanation": "Optional: Erklaerung"
    }

  free_text:
    {
      "question": "Offene Frage...",
      "expected_keywords": ["Keyword1", "Keyword2"],  // Fuer KI-Validierung
      "min_length": 50,                               // Minimale Antwortlaenge
      "max_length": 500,                              // Maximale Antwortlaenge
      "sample_answer": "Optional: Musterantwort"
    }

JSON INPUT METHODS (for complex data with newlines/special chars):

  # Method 1: Base64 encoding (recommended for scripts)
  echo '{"title":"Test","content":"Line 1\\n\\nLine 2"}' | base64
  lernplattform practice-blocks create task-slug --type="task_description" --data-base64="eyJ0aXRsZSI6..."

  # Method 2: Heredoc (recommended for interactive use)
  lernplattform practice-blocks create task-slug --type="free_text" --data-stdin <<'EOF'
  {
    "question": "Erklaere das Konzept...",
    "expected_keywords": ["Begriff1", "Begriff2"],
    "min_length": 100
  }
  EOF

  # Method 3: Pipe from file
  cat block-data.json | lernplattform practice-blocks create task-slug --type="single_choice" --data-stdin

OUTPUT:
  All commands return raw JSON from the API.
  Use jq for custom formatting:
    lernplattform practice-blocks list task-slug | jq '.[] | select(.type == "free_text")'
    lernplattform practice-blocks get task-slug id | jq '.data'
`);
}

// src/commands/rating.ts
var VALID_CONTENT_TYPES = ["lesson", "practice_task", "learning_path", "card", "platform"];
function getApiBaseUrl9() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/ratings`;
}
function getAuthToken9() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry9(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listRatings(params, token) {
  const queryParams = new URLSearchParams();
  if (params.contentType) queryParams.append("content_type", params.contentType);
  if (params.contentId) queryParams.append("content_id", params.contentId.toString());
  if (params.userId) queryParams.append("user_id", params.userId.toString());
  if (params.minRating) queryParams.append("min_rating", params.minRating.toString());
  if (params.maxRating) queryParams.append("max_rating", params.maxRating.toString());
  if (params.hasComment !== void 0) queryParams.append("has_comment", params.hasComment.toString());
  if (params.reviewed !== void 0) queryParams.append("reviewed", params.reviewed.toString());
  if (params.sort) queryParams.append("sort", params.sort);
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.perPage) queryParams.append("per_page", params.perPage.toString());
  const url = `${getApiBaseUrl9()}?${queryParams.toString()}`;
  const startTime = Date.now();
  console.error(`
Listing ratings from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getRating(id, token) {
  const url = `${getApiBaseUrl9()}/${id}`;
  const startTime = Date.now();
  console.error(`
Getting rating from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getSummary(contentType, contentId, token) {
  const queryParams = new URLSearchParams();
  queryParams.append("content_type", contentType);
  if (contentId !== null) {
    queryParams.append("content_id", contentId.toString());
  }
  const url = `${getApiBaseUrl9()}/summary?${queryParams.toString()}`;
  const startTime = Date.now();
  console.error(`
Getting rating summary from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getUserRating(contentType, contentId, token) {
  const queryParams = new URLSearchParams();
  queryParams.append("content_type", contentType);
  if (contentId !== null) {
    queryParams.append("content_id", contentId.toString());
  }
  const url = `${getApiBaseUrl9()}/user?${queryParams.toString()}`;
  const startTime = Date.now();
  console.error(`
Getting user rating from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createRating(data, token) {
  const url = getApiBaseUrl9();
  const startTime = Date.now();
  console.error(`
Creating rating via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Content Type: ${data.content_type}`);
  if (data.content_id) console.error(`   Content ID: ${data.content_id}`);
  console.error(`   Rating: ${data.rating}`);
  if (data.comment) console.error(`   Comment: ${data.comment.substring(0, 50)}${data.comment.length > 50 ? "..." : ""}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateRating(id, data, token) {
  const url = `${getApiBaseUrl9()}/${id}`;
  const startTime = Date.now();
  console.error(`
Updating rating via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(", ")}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteRating(id, token) {
  const url = `${getApiBaseUrl9()}/${id}`;
  const startTime = Date.now();
  console.error(`
Deleting rating via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry9(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run9(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help" || args.flags.help) {
      printHelp9();
      return;
    }
    const token = getAuthToken9();
    let result;
    switch (operation) {
      case "list": {
        const contentType = getOptionalFlag(args, "content-type");
        const contentIdStr = getOptionalFlag(args, "content-id");
        const userIdStr = getOptionalFlag(args, "user-id");
        const minRatingStr = getOptionalFlag(args, "min-rating");
        const maxRatingStr = getOptionalFlag(args, "max-rating");
        const hasCommentStr = getOptionalFlag(args, "has-comment");
        const reviewedStr = getOptionalFlag(args, "reviewed");
        const sort = getOptionalFlag(args, "sort");
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        const perPage = parseInt(getOptionalFlag(args, "per-page", "15"), 10);
        if (contentType && !VALID_CONTENT_TYPES.includes(contentType)) {
          console.error(JSON.stringify({
            error: `Invalid content type: ${contentType}`,
            valid_types: VALID_CONTENT_TYPES
          }, null, 2));
          process.exit(1);
        }
        result = await listRatings({
          contentType,
          contentId: contentIdStr ? parseInt(contentIdStr, 10) : void 0,
          userId: userIdStr ? parseInt(userIdStr, 10) : void 0,
          minRating: minRatingStr ? parseInt(minRatingStr, 10) : void 0,
          maxRating: maxRatingStr ? parseInt(maxRatingStr, 10) : void 0,
          hasComment: hasCommentStr ? hasCommentStr === "true" : void 0,
          reviewed: reviewedStr ? reviewedStr === "true" : void 0,
          sort,
          page,
          perPage
        }, token);
        break;
      }
      case "get": {
        const idStr = getRequiredArg(args, 0, "id");
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error("Rating ID must be a number");
        }
        result = await getRating(id, token);
        break;
      }
      case "summary": {
        const contentType = getOptionalFlag(args, "content-type");
        const contentIdStr = getOptionalFlag(args, "content-id");
        if (!contentType) {
          console.error(JSON.stringify({
            error: "Missing required flag: --content-type",
            valid_types: VALID_CONTENT_TYPES,
            example: "lernplattform rating summary --content-type=lesson --content-id=123"
          }, null, 2));
          process.exit(1);
        }
        if (!VALID_CONTENT_TYPES.includes(contentType)) {
          console.error(JSON.stringify({
            error: `Invalid content type: ${contentType}`,
            valid_types: VALID_CONTENT_TYPES
          }, null, 2));
          process.exit(1);
        }
        if (contentType !== "platform" && !contentIdStr) {
          console.error(JSON.stringify({
            error: `--content-id is required for content type: ${contentType}`,
            example: `lernplattform rating summary --content-type=${contentType} --content-id=123`
          }, null, 2));
          process.exit(1);
        }
        const contentId = contentIdStr ? parseInt(contentIdStr, 10) : null;
        result = await getSummary(contentType, contentId, token);
        break;
      }
      case "user": {
        const contentType = getOptionalFlag(args, "content-type");
        const contentIdStr = getOptionalFlag(args, "content-id");
        if (!contentType) {
          console.error(JSON.stringify({
            error: "Missing required flag: --content-type",
            valid_types: VALID_CONTENT_TYPES,
            example: "lernplattform rating user --content-type=lesson --content-id=123"
          }, null, 2));
          process.exit(1);
        }
        if (!VALID_CONTENT_TYPES.includes(contentType)) {
          console.error(JSON.stringify({
            error: `Invalid content type: ${contentType}`,
            valid_types: VALID_CONTENT_TYPES
          }, null, 2));
          process.exit(1);
        }
        if (contentType !== "platform" && !contentIdStr) {
          console.error(JSON.stringify({
            error: `--content-id is required for content type: ${contentType}`,
            example: `lernplattform rating user --content-type=${contentType} --content-id=123`
          }, null, 2));
          process.exit(1);
        }
        const contentId = contentIdStr ? parseInt(contentIdStr, 10) : null;
        result = await getUserRating(contentType, contentId, token);
        break;
      }
      case "create": {
        const contentType = getOptionalFlag(args, "content-type");
        const contentIdStr = getOptionalFlag(args, "content-id");
        const ratingStr = getOptionalFlag(args, "rating");
        if (!contentType || !ratingStr) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--content-type", "--rating"],
            optional: ["--content-id (required except for platform)", "--comment"],
            valid_types: VALID_CONTENT_TYPES,
            rating_range: "1-5"
          }, null, 2));
          process.exit(1);
        }
        if (!VALID_CONTENT_TYPES.includes(contentType)) {
          console.error(JSON.stringify({
            error: `Invalid content type: ${contentType}`,
            valid_types: VALID_CONTENT_TYPES
          }, null, 2));
          process.exit(1);
        }
        const rating = parseInt(ratingStr, 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          console.error(JSON.stringify({
            error: "Rating must be a number between 1 and 5",
            provided: ratingStr
          }, null, 2));
          process.exit(1);
        }
        if (contentType !== "platform" && !contentIdStr) {
          console.error(JSON.stringify({
            error: `--content-id is required for content type: ${contentType}`,
            example: `lernplattform rating create --content-type=${contentType} --content-id=123 --rating=5`
          }, null, 2));
          process.exit(1);
        }
        const createData = {
          content_type: contentType,
          rating
        };
        if (contentIdStr) {
          createData.content_id = parseInt(contentIdStr, 10);
        }
        const comment = getTextData(args, "comment");
        if (comment) {
          if (comment.length > 5e3) {
            console.error(JSON.stringify({
              error: "Comment exceeds maximum length of 5000 characters",
              length: comment.length
            }, null, 2));
            process.exit(1);
          }
          createData.comment = comment;
        }
        result = await createRating(createData, token);
        break;
      }
      case "update": {
        const idStr = getRequiredArg(args, 0, "id");
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error("Rating ID must be a number");
        }
        const updateData = {};
        const ratingStr = getOptionalFlag(args, "rating");
        if (ratingStr) {
          const rating = parseInt(ratingStr, 10);
          if (isNaN(rating) || rating < 1 || rating > 5) {
            console.error(JSON.stringify({
              error: "Rating must be a number between 1 and 5",
              provided: ratingStr
            }, null, 2));
            process.exit(1);
          }
          updateData.rating = rating;
        }
        const comment = getTextData(args, "comment");
        if (comment) {
          if (comment.length > 5e3) {
            console.error(JSON.stringify({
              error: "Comment exceeds maximum length of 5000 characters",
              length: comment.length
            }, null, 2));
            process.exit(1);
          }
          updateData.comment = comment;
        }
        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: "No fields to update",
            available: ["--rating", "--comment", "--comment-stdin", "--comment-base64"]
          }, null, 2));
          process.exit(1);
        }
        result = await updateRating(id, updateData, token);
        break;
      }
      case "delete": {
        const idStr = getRequiredArg(args, 0, "id");
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error("Rating ID must be a number");
        }
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        result = await deleteRating(id, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "summary", "user", "create", "update", "delete"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp9() {
  console.log(`Rating CLI - Manage content ratings

USAGE:
  lernplattform rating <operation> [args] [flags]

OPERATIONS:
  list                List all ratings (paginated, filterable)
  get <id>            Get a specific rating by ID
  summary             Get rating statistics for content
  user                Get current user's rating for content
  create              Create a new rating
  update <id>         Update an existing rating
  delete <id>         Delete a rating (requires --confirm)

CONTENT TYPES:
  lesson              Lektionen
  practice_task       Uebungsaufgaben
  learning_path       Lernpfade
  card                Karteikarten
  platform            Plattform-Bewertungen (keine content_id erforderlich)

EXAMPLES:

  LIST RATINGS:
    lernplattform rating list
    lernplattform rating list --content-type=lesson --content-id=123
    lernplattform rating list --min-rating=4 --has-comment=true --sort=-created_at
    lernplattform rating list --page=2 --per-page=10
    lernplattform rating list --user-id=42
    lernplattform rating list --reviewed=false

  GET RATING:
    lernplattform rating get 1

  GET RATING SUMMARY (Statistics):
    lernplattform rating summary --content-type=lesson --content-id=123
    lernplattform rating summary --content-type=learning_path --content-id=1
    lernplattform rating summary --content-type=platform

  GET USER RATING (own rating for content):
    lernplattform rating user --content-type=lesson --content-id=123
    lernplattform rating user --content-type=platform

  CREATE RATING (Basic):
    lernplattform rating create --content-type=lesson --content-id=123 --rating=5
    lernplattform rating create --content-type=lesson --content-id=123 --rating=5 --comment="Super!"

  CREATE RATING (Platform, no content-id):
    lernplattform rating create --content-type=platform --rating=5 --comment="Tolle Plattform!"

  CREATE RATING (with long comment using heredoc):
    lernplattform rating create --content-type=lesson --content-id=123 --rating=5 --comment-stdin <<'EOF'
    Sehr gut erklaert! Besonders gefallen hat mir:
    - Die klare Struktur
    - Die praktischen Beispiele
    - Die hilfreichen Quizzes
    EOF

  CREATE RATING (with Base64 comment):
    lernplattform rating create --content-type=lesson --content-id=123 --rating=5 \\
      --comment-base64="$(echo 'Toller Inhalt!' | base64)"

  UPDATE RATING:
    lernplattform rating update 1 --rating=4
    lernplattform rating update 1 --comment="Nach erneutem Durchgehen: Sehr gut!"
    lernplattform rating update 1 --rating=4 --comment="Aktualisierte Bewertung"

  DELETE RATING:
    lernplattform rating delete 1 --confirm

REQUIRED FLAGS (for operations):
  summary:
    --content-type="..."   Content type (required)
    --content-id=N         Content ID (required except for platform)

  user:
    --content-type="..."   Content type (required)
    --content-id=N         Content ID (required except for platform)

  create:
    --content-type="..."   Content type (required)
    --rating=N             Rating value 1-5 (required)
    --content-id=N         Content ID (required except for platform)

OPTIONAL FLAGS:
  list:
    --content-type="..."   Filter by content type
    --content-id=N         Filter by content ID
    --user-id=N            Filter by user ID
    --min-rating=N         Minimum rating (1-5)
    --max-rating=N         Maximum rating (1-5)
    --has-comment=true     Filter ratings with comments
    --reviewed=true        Filter by review status
    --sort="..."           Sort: created_at, -created_at, rating, -rating, updated_at, -updated_at
    --page=N               Page number (default: 1)
    --per-page=N           Items per page (1-100, default: 15)

  create/update:
    --comment="..."        Rating comment (max 5000 chars)
    --comment-base64="..." Comment as Base64-encoded text
    --comment-stdin        Read comment from stdin (use with heredoc or pipe)

  delete:
    --confirm              Confirm deletion (required)

RESPONSE FORMAT:

  List response:
    {
      "data": [{ rating objects }],
      "meta": { "current_page": 1, "per_page": 15, "total": 47, "last_page": 4 },
      "links": { "first": "...", "last": "...", "prev": null, "next": "..." }
    }

  Single rating:
    {
      "data": {
        "id": 1,
        "content_type": "lesson",
        "content_id": 123,
        "content_title": "Einfuehrung in SQL",
        "content_slug": "einfuehrung-in-sql",
        "rating": 5,
        "comment": "Sehr gut!",
        "reviewed": false,
        "user": { "id": 42, "name": "Max", "avatar_url": null },
        "created_at": "2026-01-06T10:30:00+00:00",
        "updated_at": "2026-01-06T10:30:00+00:00"
      }
    }

  Summary:
    {
      "data": {
        "content_type": "lesson",
        "content_id": 123,
        "average": 4.2,
        "count": 47,
        "distribution": { "1": 2, "2": 3, "3": 8, "4": 15, "5": 19 }
      }
    }

WORKFLOWS (verkettet mit anderen Bereichen):

  Schlechteste Lessons in einem Modul finden (ueber content-items, nicht .lessons!):
    MODULE_SLUG="docker-grundlagen-v3"
    lernplattform content-items list "$MODULE_SLUG" 2>/dev/null \\
      | jq -r '.data[] | select(.content_type_key=="lesson") | .content_id' \\
      | while read -r LID; do
          AVG=$(lernplattform rating summary --content-type=lesson --content-id="$LID" 2>/dev/null \\
                | jq -r '.data.average // "n/a"')
          echo "$LID  avg=$AVG"
        done | sort -k3
    # Hinweis: 'module get .lessons' ist ein legacy-Feld und fuer neuere Module oft leer.

  Alle unreviewten kritischen Bewertungen (<=2) anzeigen:
    lernplattform rating list --max-rating=2 --reviewed=false --has-comment=true --sort=-created_at \\
      | jq '.data[] | {id, rating, content_type, content_title, comment}'

OUTPUT:
  stdout = reines JSON aus der API. stderr = Status-/Debug-Logs.
  Exit 0 = Erfolg. Exit 1 = stderr enthaelt {"error": "..."}.
  Use jq for custom formatting:
    lernplattform rating list | jq '.data[] | "\\(.id) \\(.rating) stars"'
    lernplattform rating summary --content-type=lesson --content-id=123 | jq '.data.average'

NOTES:
  - Rating must be between 1 and 5
  - Comment maximum length is 5000 characters
  - content_id is required for all content types except 'platform'
  - Only own ratings can be updated or deleted
  - Use heredoc (--comment-stdin) or Base64 for multi-line comments
`);
}

// src/commands/discussion.ts
var VALID_STATUSES = ["open", "solved", "all"];
function getApiBaseUrl10() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/discussions`;
}
function getAuthToken10() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry10(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function listThreads(params, token) {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append("status", params.status);
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.page) queryParams.append("page", params.page.toString());
  const url = `${getApiBaseUrl10()}/threads?${queryParams.toString()}`;
  const startTime = Date.now();
  console.error(`
Listing discussion threads from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function getThread(id, token) {
  const url = `${getApiBaseUrl10()}/threads/${id}`;
  const startTime = Date.now();
  console.error(`
Getting discussion thread from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function createComment(threadId, data, token) {
  const url = `${getApiBaseUrl10()}/threads/${threadId}/comments`;
  const startTime = Date.now();
  console.error(`
Creating comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Author: ${data.author_email}`);
  console.error(`   Content: ${data.content.substring(0, 50)}${data.content.length > 50 ? "..." : ""}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function solveThread(threadId, data, token) {
  const url = `${getApiBaseUrl10()}/threads/${threadId}/solve`;
  const startTime = Date.now();
  console.error(`
Marking thread as solved via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Actor: ${data.actor_email}`);
  if (data.accepted_comment_id) console.error(`   Accepted Comment ID: ${data.accepted_comment_id}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function unsolveThread(threadId, data, token) {
  const url = `${getApiBaseUrl10()}/threads/${threadId}/unsolve`;
  const startTime = Date.now();
  console.error(`
Marking thread as unsolved via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function updateComment(commentId, data, token) {
  const url = `${getApiBaseUrl10()}/comments/${commentId}`;
  const startTime = Date.now();
  console.error(`
Updating comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Content: ${data.content.substring(0, 50)}${data.content.length > 50 ? "..." : ""}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function deleteComment(commentId, data, token) {
  const url = `${getApiBaseUrl10()}/comments/${commentId}`;
  const startTime = Date.now();
  console.error(`
Deleting comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}
async function acceptComment(commentId, data, token) {
  const url = `${getApiBaseUrl10()}/comments/${commentId}/accept`;
  const startTime = Date.now();
  console.error(`
Accepting comment as answer via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry10(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(data)
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run10(argv) {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === "help" || operation === "--help" || args.flags.help) {
      printHelp10();
      return;
    }
    const token = getAuthToken10();
    let result;
    switch (operation) {
      case "list": {
        const status = getOptionalFlag(args, "status", "open");
        const limit = parseInt(getOptionalFlag(args, "limit", "20"), 10);
        const page = parseInt(getOptionalFlag(args, "page", "1"), 10);
        if (status && !VALID_STATUSES.includes(status)) {
          console.error(JSON.stringify({
            error: `Invalid status: ${status}`,
            valid_statuses: VALID_STATUSES
          }, null, 2));
          process.exit(1);
        }
        result = await listThreads({ status, limit, page }, token);
        break;
      }
      case "get": {
        const idStr = getRequiredArg(args, 0, "thread-id");
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error("Thread ID must be a number");
        }
        result = await getThread(id, token);
        break;
      }
      case "comment": {
        const threadIdStr = getRequiredArg(args, 0, "thread-id");
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error("Thread ID must be a number");
        }
        const authorEmail = getOptionalFlag(args, "author-email");
        const content = getTextData(args, "content");
        if (!content || !authorEmail) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--content", "--author-email"],
            alternatives: {
              "--content-base64": "Base64-encoded content",
              "--content-stdin": "Read content from stdin"
            }
          }, null, 2));
          process.exit(1);
        }
        if (content.length > 1e4) {
          console.error(JSON.stringify({
            error: "Content exceeds maximum length of 10,000 characters",
            length: content.length
          }, null, 2));
          process.exit(1);
        }
        result = await createComment(threadId, { content, author_email: authorEmail }, token);
        break;
      }
      case "solve": {
        const threadIdStr = getRequiredArg(args, 0, "thread-id");
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error("Thread ID must be a number");
        }
        const actorEmail = getOptionalFlag(args, "actor-email");
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: "Missing required field: --actor-email",
            example: 'lernplattform discussion solve 123 --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }
        const acceptedCommentIdStr = getOptionalFlag(args, "accepted-comment-id");
        const solveData = {
          actor_email: actorEmail
        };
        if (acceptedCommentIdStr) {
          const acceptedCommentId = parseInt(acceptedCommentIdStr, 10);
          if (isNaN(acceptedCommentId)) {
            throw new Error("Accepted comment ID must be a number");
          }
          solveData.accepted_comment_id = acceptedCommentId;
        }
        result = await solveThread(threadId, solveData, token);
        break;
      }
      case "unsolve": {
        const threadIdStr = getRequiredArg(args, 0, "thread-id");
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error("Thread ID must be a number");
        }
        const actorEmail = getOptionalFlag(args, "actor-email");
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: "Missing required field: --actor-email",
            example: 'lernplattform discussion unsolve 123 --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }
        result = await unsolveThread(threadId, { actor_email: actorEmail }, token);
        break;
      }
      case "update-comment": {
        const commentIdStr = getRequiredArg(args, 0, "comment-id");
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error("Comment ID must be a number");
        }
        const actorEmail = getOptionalFlag(args, "actor-email");
        const content = getTextData(args, "content");
        if (!content || !actorEmail) {
          console.error(JSON.stringify({
            error: "Missing required fields",
            required: ["--content", "--actor-email"],
            alternatives: {
              "--content-base64": "Base64-encoded content",
              "--content-stdin": "Read content from stdin"
            }
          }, null, 2));
          process.exit(1);
        }
        if (content.length > 1e4) {
          console.error(JSON.stringify({
            error: "Content exceeds maximum length of 10,000 characters",
            length: content.length
          }, null, 2));
          process.exit(1);
        }
        result = await updateComment(commentId, { content, actor_email: actorEmail }, token);
        break;
      }
      case "delete-comment": {
        const commentIdStr = getRequiredArg(args, 0, "comment-id");
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error("Comment ID must be a number");
        }
        const actorEmail = getOptionalFlag(args, "actor-email");
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: "Missing required field: --actor-email",
            example: 'lernplattform discussion delete-comment 789 --actor-email="support@ausbildung-in-der-it.de" --confirm'
          }, null, 2));
          process.exit(1);
        }
        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: "Confirmation required",
            message: "Use --confirm to proceed with deletion"
          }, null, 2));
          process.exit(1);
        }
        await deleteComment(commentId, { actor_email: actorEmail }, token);
        result = { message: "Comment deleted successfully" };
        break;
      }
      case "accept": {
        const commentIdStr = getRequiredArg(args, 0, "comment-id");
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error("Comment ID must be a number");
        }
        const actorEmail = getOptionalFlag(args, "actor-email");
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: "Missing required field: --actor-email",
            example: 'lernplattform discussion accept 789 --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }
        result = await acceptComment(commentId, { actor_email: actorEmail }, token);
        break;
      }
      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ["list", "get", "comment", "solve", "unsolve", "update-comment", "delete-comment", "accept"]
        }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp10() {
  console.log(`Discussion CLI - Manage discussion threads and comments

USAGE:
  lernplattform discussion <operation> [args] [flags]

OPERATIONS:
  list                       List discussion threads (paginated)
  get <thread-id>            Get a single thread with all comments
  comment <thread-id>        Create a comment on a thread
  solve <thread-id>          Mark thread as solved
  unsolve <thread-id>        Mark thread as unsolved
  update-comment <id>        Update a comment
  delete-comment <id>        Delete a comment (requires --confirm)
  accept <comment-id>        Accept a comment as the answer

THREAD STATUS VALUES:
  open                       Open threads (default)
  solved                     Solved threads
  all                        All threads

EXAMPLES:

  LIST THREADS:
    lernplattform discussion list
    lernplattform discussion list --status=open --limit=10
    lernplattform discussion list --status=solved --page=2
    lernplattform discussion list --status=all --limit=50

  GET SINGLE THREAD (with comments):
    lernplattform discussion get 123

  CREATE COMMENT:
    lernplattform discussion comment 123 --content="Hier ist meine Antwort..." --author-email="support@ausbildung-in-der-it.de"

  CREATE COMMENT (with heredoc for long content):
    lernplattform discussion comment 123 --author-email="support@ausbildung-in-der-it.de" --content-stdin <<'EOF'
    LEFT JOIN gibt alle Zeilen aus der linken Tabelle zurueck,
    auch wenn es keine passenden Zeilen in der rechten Tabelle gibt.

    Beispiel:
    SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id;
    EOF

  CREATE COMMENT (with Base64 content):
    lernplattform discussion comment 123 --author-email="support@ausbildung-in-der-it.de" \\
      --content-base64="$(echo 'Meine Antwort' | base64)"

  MARK THREAD AS SOLVED:
    lernplattform discussion solve 123 --actor-email="support@ausbildung-in-der-it.de"

  MARK THREAD AS SOLVED (with accepted answer):
    lernplattform discussion solve 123 --actor-email="support@ausbildung-in-der-it.de" --accepted-comment-id=789

  MARK THREAD AS UNSOLVED:
    lernplattform discussion unsolve 123 --actor-email="support@ausbildung-in-der-it.de"

  UPDATE COMMENT:
    lernplattform discussion update-comment 789 --content="Korrigierte Antwort..." --actor-email="support@ausbildung-in-der-it.de"

  DELETE COMMENT:
    lernplattform discussion delete-comment 789 --actor-email="support@ausbildung-in-der-it.de" --confirm

  ACCEPT COMMENT AS ANSWER:
    lernplattform discussion accept 789 --actor-email="support@ausbildung-in-der-it.de"

REQUIRED FLAGS:

  comment:
    --content="..."          Comment content (max 10,000 characters)
    --author-email="..."     Email of platform admin creating the comment

  solve:
    --actor-email="..."      Email of platform admin performing action

  unsolve:
    --actor-email="..."      Email of platform admin performing action

  update-comment:
    --content="..."          New comment content (max 10,000 characters)
    --actor-email="..."      Email of platform admin performing action

  delete-comment:
    --actor-email="..."      Email of platform admin performing action
    --confirm                Confirm deletion (required)

  accept:
    --actor-email="..."      Email of platform admin performing action

OPTIONAL FLAGS:

  list:
    --status="..."           Filter by status: open, solved, all (default: open)
    --limit=N                Results per page (1-100, default: 20)
    --page=N                 Page number (default: 1)

  solve:
    --accepted-comment-id=N  ID of comment to mark as accepted answer

  comment/update-comment:
    --content-base64="..."   Content as Base64-encoded text
    --content-stdin          Read content from stdin (use with heredoc or pipe)

RESPONSE FORMAT:

  List response:
    {
      "data": [{ thread objects }],
      "meta": { "current_page": 1, "per_page": 20, "total": 42, "last_page": 3 },
      "links": { "first": "...", "last": "...", "prev": null, "next": "..." }
    }

  Single thread:
    {
      "data": {
        "id": 123,
        "title": "Frage zu SQL JOINs",
        "content": "Ich verstehe nicht...",
        "author": { "id": 456, "name": "Max", "email": "...", "is_platform_admin": false },
        "is_solved": false,
        "accepted_comment_id": null,
        "comments_count": 2,
        "context": {
          "lesson": { "id": 100, "slug": "sql-joins", "title": "SQL JOINs verstehen" },
          "module": { "id": 50, "slug": "datenbanken", "title": "Datenbanken" },
          "learning_path": { "id": 1, "slug": "fiae", "title": "Fachinformatiker AE" }
        },
        "comments": [
          { "id": 789, "content": "LEFT JOIN gibt...", "author": {...}, "is_accepted_answer": false }
        ],
        "created_at": "2025-01-10T14:30:00+00:00",
        "updated_at": "2025-01-10T15:45:00+00:00"
      }
    }

  Comment created:
    {
      "message": "Kommentar erfolgreich erstellt.",
      "data": { "id": 790, "thread_id": 123, "content": "...", "author": {...} }
    }

  Thread solved:
    {
      "message": "Thread wurde als geloest markiert.",
      "data": { "id": 123, "is_solved": true, "accepted_comment_id": 789 }
    }

WORKFLOWS (verkettet, typischer Support-Flow):

  Naechsten offenen Thread holen, Kontext lesen, antworten, schliessen:
    ADMIN="support@ausbildung-in-der-it.de"
    THREAD=$(lernplattform discussion list --status=open --limit=1 2>/dev/null \\
      | jq '.data[0].id')
    lernplattform discussion get "$THREAD" \\
      | jq '{title: .data.title, lesson: .data.context.lesson.slug, content: .data.content}'
    lernplattform discussion comment "$THREAD" --author-email="$ADMIN" --content-stdin <<'EOF'
    Die Aufloesung erfolgt ueber den Resolver des Betriebssystems...
    EOF
    # Antwort als akzeptiert markieren -> Thread schliessen:
    NEW_COMMENT=$(lernplattform discussion get "$THREAD" 2>/dev/null \\
      | jq '.data.comments[-1].id')
    lernplattform discussion solve "$THREAD" \\
      --actor-email="$ADMIN" --accepted-comment-id="$NEW_COMMENT"

  Alle offenen Threads zaehlen, gruppiert nach Lesson:
    lernplattform discussion list --status=open --limit=100 \\
      | jq '.data | group_by(.context.lesson.slug) | map({slug: .[0].context.lesson.slug, count: length})'

OUTPUT:
  stdout = reines JSON aus der API. stderr = Status-/Debug-Logs.
  Exit 0 = Erfolg. Exit 1 = stderr enthaelt {"error": "..."}.
  Use jq for custom formatting:
    lernplattform discussion list | jq '.data[] | "\\(.id) - \\(.title)"'
    lernplattform discussion get 123 | jq '.data.comments | length'

NOTES:
  - Content maximum length is 10,000 characters
  - Only platform admins can create/update/delete comments via CLI
  - The --actor-email and --author-email must belong to a platform admin
  - Use heredoc (--content-stdin) or Base64 for multi-line content
`);
}

// src/commands/search-aidi.ts
function getApiBaseUrl11() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/search`;
}
function getAuthToken11() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function fetchWithRetry11(url, options, retries = 3, timeout = 6e4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3e3 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise((resolve2) => setTimeout(resolve2, delay));
    }
  }
  throw new Error("Failed after all retries");
}
async function search(query, token) {
  const url = `${getApiBaseUrl11()}?q=${encodeURIComponent(query)}`;
  const startTime = Date.now();
  console.error(`
Searching AIDI platform...`);
  console.error(`   URL: ${url}`);
  console.error(`   Query: ${query}`);
  console.error(`   Timeout: 60 seconds
`);
  const response = await fetchWithRetry11(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1e3).toFixed(2)}s
`);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return await response.json();
}
async function run11(argv) {
  const args = parseCliArgs(argv);
  try {
    if (args.flags.help || args.positional.length === 0) {
      printHelp11();
      return;
    }
    const query = getRequiredArg(args, 0, "search query");
    const token = getAuthToken11();
    const result = await search(query, token);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
function printHelp11() {
  console.log(`AIDI Search CLI - Search platform content

DESCRIPTION:
  Search the AIDI platform for lessons, modules, practice tasks, and videos.
  Returns content that matches your query with metadata for navigation.

USAGE:
  lernplattform search "<query>"

ARGUMENTS:
  query           Search term or phrase to find in platform content

FLAGS:
  --help          Show this help message

EXAMPLES:
  # Search for networking topics
  lernplattform search "IPv4"

  # Find database lessons
  lernplattform search "SQL JOIN"

  # Search for command-line tools
  lernplattform search "nslookup"

  # Multi-word queries
  lernplattform search "object oriented programming"

  # Search for specific concepts
  lernplattform search "normalisierung datenbank"

OUTPUT FORMAT:
  Laravel paginator. Treffer in '.data', Gesamtzahl in '.meta.total':

  {
    "data": [
      {
        "type": "lesson",              // lesson | module | practice_task | video
        "id": 123,                     // numeric ID
        "title": "SQL Grundlagen",
        "slug": "sql-grundlagen",      // URL-friendly identifier
        "description": "..."           // null wenn nicht gesetzt
      }
    ],
    "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
    "meta":  { "current_page": 1, "per_page": 15, "total": 5, "last_page": 1 }
  }

  Praktisches jq:
    .data[]                            # alle Treffer
    .data[] | select(.type=="lesson")  # nur Lessons
    .meta.total                        # Gesamtanzahl

USE CASES:
  - Find lessons on specific topics before analysis
  - Discover related content for curriculum planning
  - Locate practice tasks for a concept
  - Search before creating new content (avoid duplicates)
  - Build navigation or content recommendations

TIPS:
  - Use specific technical terms: "JOIN" not "combine tables"
  - German terms work: "Einf\xFChrung", "Grundlagen"
  - Search is case-insensitive
  - Partial matches are included
  - Results include content from title, description, and body

ENVIRONMENT:
  AIDI_HOST_URL          # API host (default: production)
  AIDI_API_TOKEN         # Required: API authentication token

CONFIGURATION:
  - Timeout: 60 seconds
  - Retries: 3 attempts with exponential backoff
  - Default host: https://app.ausbildung-in-der-it.de

TROUBLESHOOTING:
  "AIDI_API_TOKEN not set"
    \u2192 Add AIDI_API_TOKEN to your .env file

  "HTTP 404"
    \u2192 Verify AIDI_HOST_URL points to correct environment
    \u2192 Ensure search endpoint exists on your environment

  "HTTP 401 Unauthorized"
    \u2192 Check that AIDI_API_TOKEN is valid for current environment

  Timeout errors
    \u2192 Large result sets may take longer
    \u2192 Check network connectivity
    \u2192 Verify API is responding

MORE HELP:
  CLI Documentation:     CLI.md
  Environment Config:    ENV_CONFIG.md
  Project Overview:      README.md
`);
}

// src/commands/image-upload.ts
import fs2 from "fs";
import path from "path";
import { glob } from "glob";
function getApiBaseUrl12() {
  const hostUrl = process.env.AIDI_HOST_URL || "https://app.ausbildung-in-der-it.de";
  return `${hostUrl}/api/content-cli/v1/images`;
}
function getAuthToken12() {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error("AIDI_API_TOKEN not set. Please set it in your .env file.");
  }
  return token;
}
async function uploadImage(filePath, directory, token, json) {
  const url = getApiBaseUrl12();
  const startTime = Date.now();
  const absolutePath = path.resolve(filePath);
  if (!fs2.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  const stats = fs2.statSync(absolutePath);
  const maxSize = 10 * 1024 * 1024;
  if (stats.size > maxSize) {
    throw new Error(
      `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum: 10MB`
    );
  }
  const filename = path.basename(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${allowedExtensions.join(", ")}`
    );
  }
  if (!json) {
    console.log(`
\u{1F4E4} Uploading image to API...`);
    console.log(`   URL: ${url}`);
    console.log(`   File: ${filename}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    if (directory) {
      console.log(`   Directory: ${directory}`);
    }
    console.log(`   Timeout: 60 seconds
`);
  }
  const formData = new FormData();
  const fileBuffer = fs2.readFileSync(absolutePath);
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  const mimeType = mimeTypes[ext] || "application/octet-stream";
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("image", blob, filename);
  if (directory) {
    formData.append("directory", directory);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6e4);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json"
    },
    body: formData,
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  const duration = Date.now() - startTime;
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    if (!json) {
      console.log(`   \u274C HTTP ${response.status}: ${errorText}
`);
    }
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  if (!json) {
    console.log(`   \u2705 Response received in ${(duration / 1e3).toFixed(2)}s`);
    console.log(`   \u{1F4CE} URL: ${data.url}
`);
  }
  return data;
}
async function run12(argv) {
  const args = parseCliArgs(argv);
  try {
    if (args.flags.help || args.positional.length === 0) {
      printHelp12();
      return;
    }
    const json = getOptionalFlag(args, "json", false);
    const directory = getOptionalFlag(args, "directory", void 0);
    const token = getAuthToken12();
    const filePatterns = args.positional;
    let files = [];
    for (const pattern of filePatterns) {
      if (pattern.includes("*")) {
        const matches = await glob(pattern);
        files.push(...matches);
      } else {
        files.push(pattern);
      }
    }
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
    files = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return imageExtensions.includes(ext);
    });
    if (files.length === 0) {
      throw new Error("No image files found matching the provided pattern(s).");
    }
    const results = [];
    const errors = [];
    for (const file of files) {
      try {
        const result = await uploadImage(file, directory, token, json);
        results.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ file, error: errorMsg });
        if (!json) {
          console.error(`   \u274C Failed to upload ${file}: ${errorMsg}`);
        }
      }
    }
    if (json) {
      console.log(JSON.stringify({
        success: results,
        errors: errors.length > 0 ? errors : void 0,
        total: files.length,
        uploaded: results.length,
        failed: errors.length
      }, null, 2));
    } else {
      if (results.length > 0) {
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
        console.log("                        UPLOAD SUMMARY");
        console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
        console.log(`\u2705 Successfully uploaded: ${results.length}/${files.length}
`);
        console.log("URLs for embedding:\n");
        for (const result of results) {
          console.log(`  ${result.original_filename}:`);
          console.log(`    ${result.url}
`);
        }
        if (errors.length > 0) {
          console.log(`
\u274C Failed: ${errors.length}`);
          for (const err of errors) {
            console.log(`  - ${err.file}: ${err.error}`);
          }
        }
      }
    }
    if (errors.length > 0 && results.length === 0) {
      process.exit(1);
    }
  } catch (error) {
    if (args.flags.json) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }, null, 2));
    } else {
      console.error("Error:", error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}
function printHelp12() {
  console.log(`Image Upload CLI - Upload images to AIDI platform storage

\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551                           IMAGE UPLOAD                                    \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D

DESCRIPTION:
  Upload local images to the AIDI platform storage and get CDN URLs
  for embedding in lessons and content blocks.

USAGE:
  lernplattform image-upload <file-path> [options]
  lernplattform image-upload <glob-pattern> [options]

EXAMPLES:
  # Upload single image
  lernplattform image-upload ./images/diagram.png

  # Upload to specific directory
  lernplattform image-upload ./images/diagram.png --directory=lessons/arrays

  # Upload multiple images with glob pattern
  lernplattform image-upload "./images/*.png" --directory=lessons/arrays

  # JSON output for scripting
  lernplattform image-upload ./images/diagram.png --json

OPTIONS:
  --directory=<path>  Subdirectory to store images in
                      Example: lessons/mehrdimensionale-arrays
  --json              Output as JSON (for scripting)
  --help              Show this help

SUPPORTED FORMATS:
  - JPEG (.jpg, .jpeg)
  - PNG (.png)
  - GIF (.gif)
  - WebP (.webp)
  - SVG (.svg)

LIMITS:
  - Maximum file size: 10MB per image

RESPONSE:
  {
    "url": "https://cdn.ausbildung-in-der-it.de/...",
    "path": "lessons/arrays/abc123.png",
    "filename": "abc123.png",
    "original_filename": "diagram.png",
    "mime_type": "image/png",
    "size": 12345
  }

ENVIRONMENT VARIABLES:
  AIDI_API_TOKEN    Required - API authentication token
  AIDI_HOST_URL     Optional - API host URL (default: production)

USE CASES:
  - Upload generated educational visuals to AIDI CDN
  - Batch upload multiple images with glob patterns
  - Get CDN URLs for embedding in lesson blocks

WORKFLOW EXAMPLE:
  # 1. Bild generieren (extern, z. B. mit dem 'tools' CLI oder beliebigem Image-Tool)
  #    tools image generate "Sketchnote: 2D-Arrays" --aspect-ratio=16:9 -o ./images/2d-arrays.png

  # 2. Bild zu AIDI CDN hochladen, URL aus JSON extrahieren
  URL=$(lernplattform image-upload ./images/2d-arrays.png \\
    --directory=lessons/mehrdimensionale-arrays --json 2>/dev/null | jq -r '.url')

  # 3. URL in Lesson-Block einsetzen (z. B. textBlock 'content' mit Markdown-Bild)
  lernplattform blocks update mehrdimensionale-arrays abc123 \\
    --data="{\\"content\\":\\"![2D Array](${URL})\\"}"

TECHNICAL NOTES:
  - Requires AIDI_API_TOKEN in .env
  - Uploads to AIDI platform storage via content-cli API
  - Returns public CDN URL for immediate use
  - Supports batch uploads with progress tracking
  - 60 second timeout per upload
`);
}

// src/cli.ts
loadEnv();
var handlers = {
  lesson: run,
  module: run2,
  blocks: run3,
  "learning-path": run4,
  path: run4,
  "learning-path-module": run5,
  "path-modules": run5,
  "module-content-item": run6,
  "content-items": run6,
  "practice-task": run7,
  practice: run7,
  "practice-blocks": run8,
  rating: run9,
  discussion: run10,
  search: run11,
  "aidi-search": run11,
  "image-upload": run12
};
var HELP_TEXT = `lernplattform - CLI f\xFCr die ausbildung-in-der-it.de Lernplattform

USAGE
  lernplattform <bereich> <aktion> [args...] [--flag=wert]

BEREICHE (sortiert nach Datenmodell-Hierarchie)
  learning-path  (path)     Lernpfade (list|get|create|update|delete)
  path-modules              Module einem Lernpfad zuordnen (list|create|delete|bulk|reorder)
  module                    Module verwalten (list|get|create|update|delete)
  content-items             Content (Lessons/Videos/Practice) einem Modul zuordnen (list|get|create|update|delete|bulk|reorder)
  lesson                    Lessons verwalten (list|get|mdx|create|update|delete)
  blocks                    Lesson-Blocks (list|get|create|update|delete|reorder|bulk)
  practice-task  (practice) Practice Tasks (list|get|create|update|delete)
  practice-blocks           Practice-Task-Blocks (list|get|create|update|delete|reorder|bulk)
  rating                    Ratings (list|get|summary|user|create|update|delete)
  discussion                Discussions (list|get|comment|solve|unsolve|update-comment|delete-comment|accept)
  search                    Plattform-Inhalte durchsuchen (Discovery)
  image-upload              Bilder zu AIDI hochladen (CDN-URLs zurueck)

DATENMODELL (grob)
  learning-path
    -> path-modules (Zuordnung learning-path <-> module)
       -> module
          -> content-items (Zuordnung module <-> lesson/video/practice-task)
             -> lesson  --> blocks
             -> practice-task --> practice-blocks

HILFE
  lernplattform <bereich> --help    Hilfe und Beispiele fuer einen Bereich
  lernplattform --version           Version anzeigen

UMGEBUNG
  Liest .env in folgender Reihenfolge:
    1) $LERNPLATTFORM_ENV_FILE
    2) ./.env (cwd)
    3) ~/.config/lernplattform/.env
  Pflicht:  AIDI_API_TOKEN
  Optional: AIDI_HOST_URL (default: https://app.ausbildung-in-der-it.de)

IO-KONVENTIONEN (wichtig fuer Skripte und Agenten)
  stdout    Reines JSON aus der API (Erfolg) bzw. MDX-Text (nur lesson mdx)
  stderr    Status-/Debug-Logs ("Listing ...", "Response received in ..s")
  Exit 0    Erfolg
  Exit 1    Fehler. stderr enthaelt JSON: {"error": "..."}
  Mit jq    lernplattform <bereich> <aktion> ... 2>/dev/null | jq '...'
            (stderr ausblenden, jq auf stdout)

DISCOVERY FUER AGENTEN
  Slug oder ID unbekannt? Erst suchen, dann lesen, dann veraendern:
    1) lernplattform search "datenbanken"          # findet lessons/module/practice
    2) lernplattform lesson list --per-page=50     # blaettern wenn search nichts hat
    3) lernplattform lesson get <slug>             # Detail inkl. Blocks
  Niemals Slugs raten. Slugs sind unique und case-sensitive.

JSON-EINGABE (Blocks, Items, lange Inhalte)
  Drei aequivalente Wege, Prioritaet stdin > base64 > inline:
    --foo='[...]'                        # inline (Quoting fragil)
    --foo-base64="$(echo '[...]' | base64)"
    --foo-stdin <<'EOF'                  # robust, empfohlen
    [ ... ]
    EOF

BEISPIELE (einzelne Befehle)
  lernplattform search "ipv4"
  lernplattform lesson list --per-page=5
  lernplattform module get relationale-datenbanken
  lernplattform blocks list sql-grundlagen
  lernplattform lesson mdx sql-grundlagen > sql.mdx
  lernplattform rating summary --content-type=lesson --content-id=123

WORKFLOWS (verkettete Beispiele)

  1) Lesson finden, Detail holen:
     # 'search' liefert Laravel-Paginator: Treffer in .data, Gesamtzahl in .meta.total
     SLUG=$(lernplattform search "ipv4" 2>/dev/null \\
       | jq -r '.data[] | select(.type=="lesson") | .slug' | head -1)
     lernplattform lesson get "$SLUG" | jq '{id, title, type, blocks: (.blocks|length)}'
     # Fuer Lessons vom Typ 'mdx' oder 'text' zusaetzlich:
     #   lernplattform lesson mdx "$SLUG" > "$SLUG.mdx"
     # 'interactive' Lessons haben keinen MDX-Export, dort lieber blocks list/get nutzen

  2) Modul anlegen und Lessons zuordnen:
     lernplattform module create \\
       --title="Schnupperkurs Python" --slug="schnupper-python" \\
       --type=normal --status=draft
     MODULE_ID=$(lernplattform module get schnupper-python 2>/dev/null | jq '.id')
     lernplattform lesson create \\
       --title="Hallo Python" --slug="hallo-python" \\
       --module-id="$MODULE_ID" --type=text --xp=50

  3) Komplette Lesson mit Blocks via stdin (robust, ohne Quoting-Aerger):
     lernplattform lesson create \\
       --title="OOP Grundlagen" --slug="oop-grundlagen" \\
       --module-id=122 --type=interactive --xp=150 \\
       --blocks-stdin <<'EOF'
     [
       {"type":"textBlock","section":"hook","data":{"title":"Einstieg","content":"..."}},
       {"type":"textBlock","section":"knowledge1","data":{"title":"Klassen","content":"..."}}
     ]
     EOF

  4) Bestehende Lesson sichern, dann Blocks ersetzen (REPLACE-Semantik!):
     lernplattform lesson get sql-grundlagen --save-to-file        # backup nach backups/
     lernplattform lesson update sql-grundlagen --blocks-stdin <<'EOF'
     [ ... neue komplette Blockliste ... ]
     EOF

  5) Lernpfad bauen (path -> path-modules -> content-items):
     lernplattform path create --title="FIAE AP2" --slug="fiae-ap2" --status=draft
     lernplattform path-modules create fiae-ap2 --module-id=122 --position=0
     lernplattform content-items create relationale-datenbanken \\
       --content-type=lesson --content-id=123 --position=0

  6) Discussion bearbeiten und schliessen:
     THREAD=$(lernplattform discussion list --status=open 2>/dev/null \\
       | jq '.data[0].id')
     lernplattform discussion comment "$THREAD" \\
       --author-email="support@ausbildung-in-der-it.de" \\
       --content-stdin <<'EOF'
     Die Aufloesung erfolgt ueber den Resolver des Betriebssystems...
     EOF
     lernplattform discussion solve "$THREAD" \\
       --actor-email="support@ausbildung-in-der-it.de"

DESTRUKTIVE OPERATIONEN
  delete erfordert immer --confirm. Ohne --confirm Exit 1 mit Fehler-JSON.
  Beispiel: lernplattform lesson delete old-lesson --confirm

WEITERE HINWEISE
  - Pagination: --page=N --per-page=N (Default per-page meist 15-20)
  - Mehrere Aliase pro Bereich (z. B. path == learning-path, practice == practice-task)
  - bulk und reorder erwarten JSON-Arrays. Bei reorder: ALLE IDs angeben.
  - Update-Operationen auf Blocks-Listen sind REPLACE (alle Blocks werden ersetzt)
`;
async function main() {
  const argv = process.argv.slice(2);
  const category = argv[0];
  if (!category || category === "--help" || category === "-h" || category === "help") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  if (category === "--version" || category === "-v") {
    console.log("lernplattform-cli 0.1.0");
    return;
  }
  const handler = handlers[category];
  if (!handler) {
    console.error(`Unbekannter Bereich: ${category}
`);
    process.stdout.write(HELP_TEXT);
    process.exit(1);
  }
  await handler(argv.slice(1));
}
main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
});
