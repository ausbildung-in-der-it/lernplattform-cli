/**
 * Learning Path Modules CLI - Manage modules within learning paths
 *
 * Learning path modules link modules to learning paths and define their order.
 *
 * Usage:
 *   npm run path-modules:list <learning-path-slug>
 *   npm run path-modules:create <learning-path-slug> --module-id=123 [--position=0]
 *   npm run path-modules:delete <learning-path-slug> <module-slug> -- --confirm
 *   npm run path-modules:bulk <learning-path-slug> --module-ids='[1, 2, 3]'
 *   npm run path-modules:reorder <learning-path-slug> 1,2,3,4,5
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getJsonData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface LearningPathModuleData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  editorial_status: string;
  position: number;
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

function getApiBaseUrl(learningPathSlug: string): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/learning-paths/${learningPathSlug}/modules`;
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

async function listModules(
  learningPathSlug: string,
  token: string
): Promise<PaginatedResponse<LearningPathModuleData>> {
  const url = getApiBaseUrl(learningPathSlug);
  const startTime = Date.now();

  console.error(`\nListing modules from API...`);
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

async function createModule(
  learningPathSlug: string,
  moduleId: number,
  position: number | undefined,
  token: string
): Promise<LearningPathModuleData> {
  const url = getApiBaseUrl(learningPathSlug);
  const startTime = Date.now();

  const payload: Record<string, any> = {
    module_id: moduleId,
  };

  if (position !== undefined) {
    payload.position = position;
  }

  console.error(`\nAdding module to learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Payload: ${JSON.stringify(payload)}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function deleteModule(
  learningPathSlug: string,
  moduleSlug: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl(learningPathSlug)}/${moduleSlug}`;
  const startTime = Date.now();

  console.error(`\nRemoving module from learning path via API...`);
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

async function bulkAddModules(
  learningPathSlug: string,
  moduleIds: number[],
  token: string
): Promise<{ added: number; modules: LearningPathModuleData[] }> {
  const url = `${getApiBaseUrl(learningPathSlug)}/bulk`;
  const startTime = Date.now();

  const payload = { module_ids: moduleIds };

  console.error(`\nBulk adding modules to learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Module IDs: ${moduleIds.join(', ')}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - startTime;
  console.error(`   Response received in ${(duration / 1000).toFixed(2)}s\n`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

async function reorderModules(
  learningPathSlug: string,
  moduleIds: number[],
  token: string
): Promise<{ message: string }> {
  const url = `${getApiBaseUrl(learningPathSlug)}/reorder`;
  const startTime = Date.now();

  const payload = { module_ids: moduleIds };

  console.error(`\nReordering modules in learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Module IDs: ${moduleIds.join(', ')}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
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
        const learningPathSlug = getRequiredArg(args, 0, 'learning-path-slug');
        result = await listModules(learningPathSlug, token);
        break;
      }

      case 'create': {
        const learningPathSlug = getRequiredArg(args, 0, 'learning-path-slug');
        const moduleIdStr = getOptionalFlag(args, 'module-id');
        const positionStr = getOptionalFlag(args, 'position');

        if (!moduleIdStr) {
          console.error(JSON.stringify({
            error: 'Missing required field',
            required: ['--module-id'],
            optional: ['--position']
          }, null, 2));
          process.exit(1);
        }

        const moduleId = parseInt(moduleIdStr, 10);
        if (isNaN(moduleId)) {
          throw new Error('--module-id must be a number');
        }

        const position = positionStr !== undefined ? parseInt(positionStr, 10) : undefined;

        result = await createModule(learningPathSlug, moduleId, position, token);
        break;
      }

      case 'delete': {
        const learningPathSlug = getRequiredArg(args, 0, 'learning-path-slug');
        const moduleSlug = getRequiredArg(args, 1, 'module-slug');

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteModule(learningPathSlug, moduleSlug, token);
        result = { success: true, message: 'Module removed from learning path successfully' };
        break;
      }

      case 'bulk': {
        const learningPathSlug = getRequiredArg(args, 0, 'learning-path-slug');
        // Support: --module-ids, --module-ids-base64, --module-ids-stdin
        const moduleIds = getJsonData(args, 'module-ids');

        if (!moduleIds) {
          console.error(JSON.stringify({
            error: 'Missing required field',
            required: ['--module-ids (JSON array of integers)'],
            example: '--module-ids=\'[1, 2, 3]\'',
            alternatives: {
              '--module-ids-base64': 'Base64-encoded JSON array',
              '--module-ids-stdin': 'Read JSON array from stdin'
            }
          }, null, 2));
          process.exit(1);
        }

        if (!Array.isArray(moduleIds) || !moduleIds.every(id => typeof id === 'number')) {
          throw new Error('--module-ids must be an array of integers');
        }

        result = await bulkAddModules(learningPathSlug, moduleIds, token);
        break;
      }

      case 'reorder': {
        const learningPathSlug = getRequiredArg(args, 0, 'learning-path-slug');
        const moduleIdsArg = getRequiredArg(args, 1, 'module-ids (comma-separated)');
        const moduleIds = moduleIdsArg.split(',').map(id => {
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
          available: ['list', 'create', 'delete', 'bulk', 'reorder']
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
  console.log(`Learning Path Modules CLI - Manage modules within learning paths

DESCRIPTION:
  Learning path modules link modules to learning paths and define their order.
  This CLI manages these associations and their ordering.

USAGE:
  npm run path-modules:<operation> <learning-path-slug> [args] [flags]

OPERATIONS:
  list <learning-path-slug>                    List all modules in a learning path
  create <learning-path-slug>                  Add module to learning path
  delete <learning-path-slug> <module-slug>    Remove module (requires --confirm)
  bulk <learning-path-slug>                    Bulk add modules
  reorder <learning-path-slug> <ids>           Reorder modules (comma-separated IDs)

EXAMPLES:
  # List modules in a learning path
  npm run path-modules:list ap-teil-2-pruefung

  # Add a module to learning path
  npm run path-modules:create ap-teil-2-pruefung \\
    --module-id=123 \\
    --position=0

  # Add a module without specific position (appends to end)
  npm run path-modules:create ap-teil-2-pruefung --module-id=456

  # Remove module from learning path
  npm run path-modules:delete ap-teil-2-pruefung relationale-datenbanken -- --confirm

  # Bulk add modules to learning path
  npm run path-modules:bulk ap-teil-2-pruefung \\
    --module-ids='[1, 2, 3, 4, 5]'

  # Reorder all modules (must include ALL module IDs)
  npm run path-modules:reorder ap-teil-2-pruefung 5,3,1,4,2

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

