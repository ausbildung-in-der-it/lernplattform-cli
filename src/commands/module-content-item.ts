/**
 * Module Content Items CLI - Manage content items within modules
 *
 * Content items link content (lessons, videos, practice tasks) to modules.
 *
 * Usage:
 *   lernplattform content-items list <module-slug>
 *   lernplattform content-items get <module-slug> <item-id>
 *   lernplattform content-items create <module-slug> --content-type="lesson" --content-id=123
 *   lernplattform content-items update <module-slug> <item-id> --position=5
 *   lernplattform content-items delete <module-slug> <item-id> --confirm
 *   lernplattform content-items bulk <module-slug> --items='[...]'
 *   lernplattform content-items reorder <module-slug> 1,2,3,4,5
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getJsonData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface ModuleContentItemData {
  id: number;
  module_id: number;
  content_type: string;
  content_type_key: string;
  content_id: number;
  position: number;
  included_in_primary_flow: boolean;
  content_title: string | null;
  content_slug: string | null;
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

function getApiBaseUrl(moduleSlug: string): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/modules/${moduleSlug}/content-items`;
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

async function listContentItems(
  moduleSlug: string,
  token: string
): Promise<PaginatedResponse<ModuleContentItemData>> {
  const url = getApiBaseUrl(moduleSlug);
  const startTime = Date.now();

  console.error(`\nListing content items from API...`);
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

async function getContentItem(
  moduleSlug: string,
  itemId: number,
  token: string
): Promise<ModuleContentItemData> {
  const url = `${getApiBaseUrl(moduleSlug)}/${itemId}`;
  const startTime = Date.now();

  console.error(`\nGetting content item from API...`);
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

async function createContentItem(
  moduleSlug: string,
  contentType: string,
  contentId: number,
  position: number | undefined,
  includedInPrimaryFlow: boolean | undefined,
  token: string
): Promise<ModuleContentItemData> {
  const url = getApiBaseUrl(moduleSlug);
  const startTime = Date.now();

  const payload: Record<string, any> = {
    content_type: contentType,
    content_id: contentId,
  };

  if (position !== undefined) {
    payload.position = position;
  }
  if (includedInPrimaryFlow !== undefined) {
    payload.included_in_primary_flow = includedInPrimaryFlow;
  }

  console.error(`\nCreating content item via API...`);
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

async function updateContentItem(
  moduleSlug: string,
  itemId: number,
  position: number | undefined,
  includedInPrimaryFlow: boolean | undefined,
  token: string
): Promise<ModuleContentItemData> {
  const url = `${getApiBaseUrl(moduleSlug)}/${itemId}`;
  const startTime = Date.now();

  const payload: Record<string, any> = {};

  if (position !== undefined) {
    payload.position = position;
  }
  if (includedInPrimaryFlow !== undefined) {
    payload.included_in_primary_flow = includedInPrimaryFlow;
  }

  console.error(`\nUpdating content item via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Payload: ${JSON.stringify(payload)}`);
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

async function deleteContentItem(
  moduleSlug: string,
  itemId: number,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl(moduleSlug)}/${itemId}`;
  const startTime = Date.now();

  console.error(`\nDeleting content item via API...`);
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

async function bulkCreateContentItems(
  moduleSlug: string,
  items: Array<{
    content_type: string;
    content_id: number;
    position?: number;
    included_in_primary_flow?: boolean;
  }>,
  token: string
): Promise<{ created: number; items: ModuleContentItemData[] }> {
  const url = `${getApiBaseUrl(moduleSlug)}/bulk`;
  const startTime = Date.now();

  const payload = { items };

  console.error(`\nBulk creating content items via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Items count: ${items.length}`);
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

async function reorderContentItems(
  moduleSlug: string,
  itemIds: number[],
  token: string
): Promise<{ message: string }> {
  const url = `${getApiBaseUrl(moduleSlug)}/reorder`;
  const startTime = Date.now();

  const payload = { item_ids: itemIds };

  console.error(`\nReordering content items via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Item IDs: ${itemIds.join(', ')}`);
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
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        result = await listContentItems(moduleSlug, token);
        break;
      }

      case 'get': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        const itemId = parseInt(getRequiredArg(args, 1, 'item-id'), 10);
        if (isNaN(itemId)) {
          throw new Error('item-id must be a number');
        }
        result = await getContentItem(moduleSlug, itemId, token);
        break;
      }

      case 'create': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        const contentType = getOptionalFlag(args, 'content-type');
        const contentIdStr = getOptionalFlag(args, 'content-id');
        const positionStr = getOptionalFlag(args, 'position');
        const includedInPrimaryFlowStr = getOptionalFlag(args, 'included-in-primary-flow');

        if (!contentType || !contentIdStr) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--content-type (lesson|video|practice_task)', '--content-id'],
            optional: ['--position', '--included-in-primary-flow']
          }, null, 2));
          process.exit(1);
        }

        const contentId = parseInt(contentIdStr, 10);
        if (isNaN(contentId)) {
          throw new Error('--content-id must be a number');
        }

        const position = positionStr !== undefined ? parseInt(positionStr, 10) : undefined;
        const includedInPrimaryFlow = includedInPrimaryFlowStr !== undefined
          ? includedInPrimaryFlowStr === 'true' || includedInPrimaryFlowStr === true
          : undefined;

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

      case 'update': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        const itemId = parseInt(getRequiredArg(args, 1, 'item-id'), 10);
        if (isNaN(itemId)) {
          throw new Error('item-id must be a number');
        }

        const positionStr = getOptionalFlag(args, 'position');
        const includedInPrimaryFlowStr = getOptionalFlag(args, 'included-in-primary-flow');

        if (positionStr === undefined && includedInPrimaryFlowStr === undefined) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--position', '--included-in-primary-flow']
          }, null, 2));
          process.exit(1);
        }

        const position = positionStr !== undefined ? parseInt(positionStr, 10) : undefined;
        const includedInPrimaryFlow = includedInPrimaryFlowStr !== undefined
          ? includedInPrimaryFlowStr === 'true' || includedInPrimaryFlowStr === true
          : undefined;

        result = await updateContentItem(
          moduleSlug,
          itemId,
          position,
          includedInPrimaryFlow,
          token
        );
        break;
      }

      case 'delete': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        const itemId = parseInt(getRequiredArg(args, 1, 'item-id'), 10);
        if (isNaN(itemId)) {
          throw new Error('item-id must be a number');
        }

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteContentItem(moduleSlug, itemId, token);
        result = { success: true, message: 'Content item deleted successfully' };
        break;
      }

      case 'bulk': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        // Support: --items, --items-base64, --items-stdin
        const items = getJsonData(args, 'items');

        if (!items) {
          console.error(JSON.stringify({
            error: 'Missing required field',
            required: ['--items (JSON array)'],
            example: '--items=\'[{"content_type":"lesson","content_id":123},{"content_type":"video","content_id":456}]\'',
            alternatives: {
              '--items-base64': 'Base64-encoded JSON array (avoids shell escaping)',
              '--items-stdin': 'Read JSON array from stdin (use with heredoc or pipe)'
            }
          }, null, 2));
          process.exit(1);
        }

        result = await bulkCreateContentItems(moduleSlug, items, token);
        break;
      }

      case 'reorder': {
        const moduleSlug = getRequiredArg(args, 0, 'module-slug');
        const itemIdsArg = getRequiredArg(args, 1, 'item-ids (comma-separated)');
        const itemIds = itemIdsArg.split(',').map(id => {
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
          available: ['list', 'get', 'create', 'update', 'delete', 'bulk', 'reorder']
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

