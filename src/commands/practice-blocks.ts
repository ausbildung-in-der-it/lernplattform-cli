/**
 * Practice Blocks CLI - Command line interface for practice task blocks management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   lernplattform practice-blocks list <practice-task-slug>
 *   lernplattform practice-blocks get <practice-task-slug> <block-id>
 *   lernplattform practice-blocks create <practice-task-slug> --type="task_description" --data='{...}'
 *   lernplattform practice-blocks update <practice-task-slug> <block-id> --data='{...}'
 *   lernplattform practice-blocks delete <practice-task-slug> <block-id> --confirm
 *   lernplattform practice-blocks reorder <practice-task-slug> id1,id2,id3
 *   lernplattform practice-blocks bulk <practice-task-slug> --blocks='[...]'
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getJsonData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface PracticeBlockData {
  id: string;
  type: string; // free_text | multiple_choice | single_choice | task_description
  position: number;
  data: Record<string, any>;
  practice_task_id: number;
}

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(practiceTaskSlug: string): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/practice-tasks/${practiceTaskSlug}/blocks`;
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
  practiceTaskSlug: string,
  token: string
): Promise<PracticeBlockData[]> {
  const url = getApiBaseUrl(practiceTaskSlug);
  const startTime = Date.now();

  console.error(`\nListing practice blocks from API...`);
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
  practiceTaskSlug: string,
  blockId: string,
  token: string
): Promise<PracticeBlockData> {
  const url = `${getApiBaseUrl(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nGetting practice block from API...`);
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
  practiceTaskSlug: string,
  data: {
    type: string;
    data: Record<string, any>;
    position?: number;
  },
  token: string
): Promise<PracticeBlockData> {
  const url = getApiBaseUrl(practiceTaskSlug);
  const startTime = Date.now();

  console.error(`\nCreating practice block via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Type: ${data.type}`);
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
  practiceTaskSlug: string,
  blockId: string,
  data: {
    type?: string;
    data?: Record<string, any>;
  },
  token: string
): Promise<PracticeBlockData> {
  const url = `${getApiBaseUrl(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nUpdating practice block via API...`);
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
  practiceTaskSlug: string,
  blockId: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl(practiceTaskSlug)}/${blockId}`;
  const startTime = Date.now();

  console.error(`\nDeleting practice block via API...`);
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
  practiceTaskSlug: string,
  blockIds: string[],
  token: string
): Promise<{ message: string }> {
  const url = `${getApiBaseUrl(practiceTaskSlug)}/reorder`;
  const startTime = Date.now();

  console.error(`\nReordering practice blocks via API...`);
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
  practiceTaskSlug: string,
  bulkOp: 'update' | 'delete',
  blocks: Array<{ id: string; type?: string; data?: Record<string, any> }>,
  token: string
): Promise<{ updated?: number; deleted?: number; blocks?: PracticeBlockData[] }> {
  const url = `${getApiBaseUrl(practiceTaskSlug)}/bulk`;
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
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        result = await listBlocks(practiceTaskSlug, token);
        break;
      }

      case 'get': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');
        result = await getBlock(practiceTaskSlug, blockId, token);
        break;
      }

      case 'create': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        const type = getOptionalFlag(args, 'type');
        // Support: --data, --data-base64, --data-stdin
        const data = getJsonData(args, 'data');

        if (!type || !data) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--type (free_text|multiple_choice|single_choice|task_description)', '--data (JSON object)'],
            optional: ['--position'],
            alternatives: {
              '--data-base64': 'Base64-encoded JSON (avoids shell escaping)',
              '--data-stdin': 'Read JSON from stdin (use with heredoc or pipe)'
            }
          }, null, 2));
          process.exit(1);
        }

        const createData: any = { type, data };
        if (args.flags.position !== undefined) {
          createData.position = parseInt(args.flags.position, 10);
        }

        result = await createBlock(practiceTaskSlug, createData, token);
        break;
      }

      case 'update': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');
        const updateData: any = {};

        if (args.flags.type) updateData.type = args.flags.type;
        // Support: --data, --data-base64, --data-stdin
        const data = getJsonData(args, 'data');
        if (data) updateData.data = data;

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--type', '--data'],
            alternatives: {
              '--data-base64': 'Base64-encoded JSON (avoids shell escaping)',
              '--data-stdin': 'Read JSON from stdin (use with heredoc or pipe)'
            }
          }, null, 2));
          process.exit(1);
        }

        result = await updateBlock(practiceTaskSlug, blockId, updateData, token);
        break;
      }

      case 'delete': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        const blockId = getRequiredArg(args, 1, 'block-id');

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteBlock(practiceTaskSlug, blockId, token);
        result = { success: true, message: 'Block deleted successfully' };
        break;
      }

      case 'reorder': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
        const blockIdsArg = getRequiredArg(args, 1, 'block-ids (comma-separated)');
        const blockIds = blockIdsArg.split(',').map(id => id.trim());

        result = await reorderBlocks(practiceTaskSlug, blockIds, token);
        break;
      }

      case 'bulk': {
        const practiceTaskSlug = getRequiredArg(args, 0, 'practice-task-slug');
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

        result = await bulkOperation(practiceTaskSlug, bulkOp, blocksData, token);
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

