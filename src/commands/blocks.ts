/**
 * Blocks CLI - Command line interface for lesson blocks management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   lernplattform blocks list <lesson-slug>
 *   lernplattform blocks get <lesson-slug> <block-id>
 *   lernplattform blocks create <lesson-slug> --type="textBlock" --section="hook" --data='{...}'
 *   lernplattform blocks update <lesson-slug> <block-id> --data='{...}'
 *   lernplattform blocks delete <lesson-slug> <block-id> --confirm
 *   lernplattform blocks reorder <lesson-slug> id1,id2,id3
 *   lernplattform blocks bulk <lesson-slug> --blocks='[...]'
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getJsonData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface BlockData {
  id: string;
  type: string;
  section: string;
  position: number;
  data: Record<string, any>;
  lesson_id: number;
}

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(lessonSlug: string): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/lessons/${lessonSlug}/blocks`;
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

async function listBlocks(
  lessonSlug: string,
  token: string
): Promise<BlockData[]> {
  const url = getApiBaseUrl(lessonSlug);
  const startTime = Date.now();

  console.error(`\nListing blocks from API...`);
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

async function getBlock(
  lessonSlug: string,
  blockId: string,
  token: string
): Promise<BlockData> {
  const url = `${getApiBaseUrl(lessonSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nGetting block from API...`);
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

async function createBlock(
  lessonSlug: string,
  data: {
    type: string;
    section: string;
    data: Record<string, any>;
    position?: number;
  },
  token: string
): Promise<BlockData> {
  const url = getApiBaseUrl(lessonSlug);
  const startTime = Date.now();

  console.error(`\nCreating block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   Section: ${data.section}`);
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

async function updateBlock(
  lessonSlug: string,
  blockId: string,
  data: {
    type?: string;
    section?: string;
    data?: Record<string, any>;
  },
  token: string
): Promise<BlockData> {
  const url = `${getApiBaseUrl(lessonSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nUpdating block via API...`);
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

async function deleteBlock(
  lessonSlug: string,
  blockId: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl(lessonSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nDeleting block via API...`);
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

async function reorderBlocks(
  lessonSlug: string,
  blockIds: string[],
  token: string
): Promise<{ message: string }> {
  const url = `${getApiBaseUrl(lessonSlug)}/reorder`;
  const startTime = Date.now();

  console.error(`\nReordering blocks via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Block IDs: ${blockIds.join(', ')}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ block_ids: blockIds }),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function bulkOperation(
  lessonSlug: string,
  bulkOp: 'update' | 'delete',
  blocks: Array<{ id: string; type?: string; section?: string; data?: Record<string, any> }>,
  token: string
): Promise<{ updated?: number; deleted?: number; blocks?: BlockData[] }> {
  const url = `${getApiBaseUrl(lessonSlug)}/bulk`;
  const startTime = Date.now();

  console.error(`\nBulk ${bulkOp} via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Operation: ${bulkOp}`);
  console.error(`   Block count: ${blocks.length}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ operation: bulkOp, blocks }),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
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
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        result = await listBlocks(lessonSlug, token);
        break;
      }

      case 'get': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');
        result = await getBlock(lessonSlug, blockId, token);
        break;
      }

      case 'create': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const type = getOptionalFlag(args, 'type');
        const section = getOptionalFlag(args, 'section');
        // Support: --data, --data-base64, --data-stdin
        const data = getJsonData(args, 'data');

        if (!type || !section || !data) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--type (textBlock|interactiveQuiz)', '--section', '--data (JSON object)'],
            optional: ['--position'],
            alternatives: {
              '--data-base64': 'Base64-encoded JSON (avoids shell escaping)',
              '--data-stdin': 'Read JSON from stdin (use with heredoc or pipe)'
            }
          }, null, 2));
          process.exit(1);
        }

        const createData: any = { type, section, data };
        if (args.flags.position !== undefined) {
          createData.position = parseInt(args.flags.position, 10);
        }

        result = await createBlock(lessonSlug, createData, token);
        break;
      }

      case 'update': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');
        const updateData: any = {};

        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.section) updateData.section = args.flags.section;
        // Support: --data, --data-base64, --data-stdin
        const data = getJsonData(args, 'data');
        if (data) updateData.data = data;

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--type', '--section', '--data'],
            alternatives: {
              '--data-base64': 'Base64-encoded JSON (avoids shell escaping)',
              '--data-stdin': 'Read JSON from stdin (use with heredoc or pipe)'
            }
          }, null, 2));
          process.exit(1);
        }

        result = await updateBlock(lessonSlug, blockId, updateData, token);
        break;
      }

      case 'delete': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteBlock(lessonSlug, blockId, token);
        result = { success: true, message: 'Block deleted successfully' };
        break;
      }

      case 'reorder': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const blockIdsArg = getRequiredArg(args, 1, 'block-ids (comma-separated)');
        const blockIds = blockIdsArg.split(',').map(id => id.trim());

        result = await reorderBlocks(lessonSlug, blockIds, token);
        break;
      }

      case 'bulk': {
        const lessonSlug = getRequiredArg(args, 0, 'lesson-slug');
        const bulkOp = (getOptionalFlag(args, 'operation', 'update') as 'update' | 'delete');
        // Support: --blocks, --blocks-base64, --blocks-stdin
        const blocksData = getJsonData(args, 'blocks');

        if (!blocksData) {
          console.error(JSON.stringify({
            error: 'Missing required field',
            required: ['--blocks (JSON array)'],
            optional: ['--operation (update|delete, default: update)'],
            alternatives: {
              '--blocks-base64': 'Base64-encoded JSON array (avoids shell escaping)',
              '--blocks-stdin': 'Read JSON array from stdin (use with heredoc or pipe)'
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
          available: ['list', 'get', 'create', 'update', 'delete', 'reorder', 'bulk']
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
    --data='{"title":"SQL Einführung","content":"SQL ist..."}'

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

