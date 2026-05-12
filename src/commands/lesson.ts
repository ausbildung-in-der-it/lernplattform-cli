/**
 * Lesson CLI - Command line interface for lesson management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   lernplattform lesson list [--page=N] [--per-page=N]
 *   lernplattform lesson get <slug>
 *   lernplattform lesson create --title="..." --slug="..." --module-id=N --type="..." --xp=N
 *   lernplattform lesson update <slug> --title="..."
 *   lernplattform lesson delete <slug> --confirm
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getTextData, getJsonData } from '../utils/args';
import { saveToFile } from '../utils/save';


// ============================================================================
// Types
// ============================================================================

interface LessonData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  content: string | null;
  position: number;
  xp: number;
  type: string;
  editorial_status: string;
  blocks: any[];
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/lessons`;
}

function getAuthToken(): string {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error('AIDI_API_TOKEN not set. Please set it in your .env file.');
  }
  return token;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 3,
  timeout: number = 60000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = 3000 * (attempt + 1);
      console.error(`   Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Failed after all retries');
}

// ============================================================================
// Operation Handlers
// ============================================================================

async function listLessons(
  page: number,
  perPage: number,
  token: string
): Promise<PaginatedResponse<LessonData>> {
  const url = `${getApiBaseUrl()}?page=${page}&per_page=${perPage}`;
  const startTime = Date.now();

  console.error(`\nListing lessons from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function getLesson(
  slug: string,
  token: string
): Promise<LessonData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nGetting lesson from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function createLesson(
  data: {
    title: string;
    slug: string;
    module_id: number;
    type: string;
    xp: number;
    editorial_status: string;
    description?: string;
    content?: string;
    position?: number;
    blocks?: any[];
  },
  token: string
): Promise<LessonData> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  console.error(`\nCreating lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   XP: ${data.xp}`);
  if (data.blocks) {
    console.error(`   Blocks: ${data.blocks.length} block(s)`);
  }
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function updateLesson(
  slug: string,
  data: {
    title?: string;
    module_id?: number;
    description?: string;
    content?: string;
    type?: string;
    editorial_status?: string;
    position?: number;
    xp?: number;
    blocks?: any[];
  },
  token: string
): Promise<LessonData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nUpdating lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Fields: ${Object.keys(data).join(', ')}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function deleteLesson(
  slug: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nDeleting lesson via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}

async function getLessonMdx(
  slug: string,
  token: string
): Promise<string> {
  const url = `${getApiBaseUrl()}/${slug}/mdx`;
  const startTime = Date.now();

  console.error(`\nGetting MDX content from API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/plain',
    },
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.text();
}

// ============================================================================
// Main
// ============================================================================

export async function run(argv: string[]): Promise<void> {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    if (!operation || operation === 'help' || operation === '--help') {
      printHelp();
      return;
    }

    const token = getAuthToken();
    let result;

    switch (operation) {
      case 'list': {
        const page = parseInt(getOptionalFlag(args, 'page', '1'), 10);
        const perPage = parseInt(getOptionalFlag(args, 'per-page', '20'), 10);
        result = await listLessons(page, perPage, token);
        break;
      }

      case 'get': {
        const slug = getRequiredArg(args, 0, 'slug');
        result = await getLesson(slug, token);

        // Save to file if requested
        if (args.flags['save-to-file']) {
          const filepath = saveToFile('lesson', slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }

      case 'create': {
        const title = getOptionalFlag(args, 'title');
        const slug = getOptionalFlag(args, 'slug');
        const moduleIdStr = getOptionalFlag(args, 'module-id');
        const type = getOptionalFlag(args, 'type');
        const xpStr = getOptionalFlag(args, 'xp');
        const status = getOptionalFlag(args, 'status', 'draft');

        // Enforce required fields including xp
        if (!title || !slug || !moduleIdStr || !type || xpStr === undefined) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--title', '--slug', '--module-id', '--type', '--xp'],
            optional: ['--status (default: draft)', '--description', '--content', '--position', '--blocks'],
            types: ['text', 'mdx', 'interactive']
          }, null, 2));
          process.exit(1);
        }

        const moduleId = parseInt(moduleIdStr, 10);
        if (isNaN(moduleId)) {
          throw new Error('--module-id must be a number');
        }

        const xp = parseInt(xpStr, 10);
        if (isNaN(xp) || xp < 0) {
          throw new Error('--xp must be a non-negative number');
        }

        const createData: any = {
          title,
          slug,
          module_id: moduleId,
          type,
          xp,
          editorial_status: status,
        };

        if (args.flags.description) createData.description = args.flags.description;

        // Support: --content, --content-base64, --content-stdin
        const content = getTextData(args, 'content');
        if (content) createData.content = content;

        if (args.flags.position !== undefined) {
          createData.position = parseInt(args.flags.position, 10);
        }

        // Support: --blocks, --blocks-base64, --blocks-stdin
        const blocks = getJsonData(args, 'blocks');
        if (blocks) createData.blocks = blocks;

        result = await createLesson(createData, token);
        break;
      }

      case 'update': {
        const slug = getRequiredArg(args, 0, 'slug');
        const updateData: any = {};

        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags['module-id']) {
          updateData.module_id = parseInt(args.flags['module-id'], 10);
        }
        if (args.flags.description) updateData.description = args.flags.description;

        // Support: --content, --content-base64, --content-stdin
        const content = getTextData(args, 'content');
        if (content) updateData.content = content;

        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags.position !== undefined) {
          updateData.position = parseInt(args.flags.position, 10);
        }
        if (args.flags.xp !== undefined) {
          updateData.xp = parseInt(args.flags.xp, 10);
        }

        // Support: --blocks, --blocks-base64, --blocks-stdin
        const blocks = getJsonData(args, 'blocks');
        if (blocks) updateData.blocks = blocks;

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--title', '--module-id', '--description', '--content', '--type', '--status', '--position', '--xp', '--blocks']
          }, null, 2));
          process.exit(1);
        }

        result = await updateLesson(slug, updateData, token);
        break;
      }

      case 'delete': {
        const slug = getRequiredArg(args, 0, 'slug');

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteLesson(slug, token);
        result = { success: true, message: 'Lesson deleted successfully' };
        break;
      }

      case 'mdx': {
        const slug = getRequiredArg(args, 0, 'slug');
        const mdxContent = await getLessonMdx(slug, token);
        // Output MDX directly (not JSON)
        console.log(mdxContent);
        return;
      }

      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ['list', 'get', 'create', 'update', 'delete', 'mdx']
        }, null, 2));
        process.exit(1);
    }

    // Output raw JSON
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

