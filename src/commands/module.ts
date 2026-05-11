/**
 * Module CLI - Command line interface for module management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   npm run module:list [--page=N] [--per-page=N]
 *   npm run module:get <slug>
 *   npm run module:create --title="..." --slug="..." --type="normal" --status="draft"
 *   npm run module:update <slug> -- --title="..."
 *   npm run module:delete <slug> -- --confirm
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag } from '../utils/args';
import { saveToFile } from '../utils/save';


// ============================================================================
// Types
// ============================================================================

interface ModuleData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  editorial_status: string;
  position: number;
  lessons?: any[];
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
  return `${hostUrl}/api/content-cli/v1/modules`;
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
  page: number,
  perPage: number,
  token: string
): Promise<PaginatedResponse<ModuleData>> {
  const url = `${getApiBaseUrl()}?page=${page}&per_page=${perPage}`;
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

async function getModule(
  slug: string,
  token: string
): Promise<ModuleData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nGetting module from API...`);
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
  data: {
    title: string;
    slug: string;
    type: string;
    editorial_status: string;
    description?: string;
    position?: number;
  },
  token: string
): Promise<ModuleData> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  console.error(`\nCreating module via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
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

async function updateModule(
  slug: string,
  data: {
    title?: string;
    description?: string;
    type?: string;
    editorial_status?: string;
    position?: number;
  },
  token: string
): Promise<ModuleData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nUpdating module via API...`);
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

async function deleteModule(
  slug: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nDeleting module via API...`);
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
        result = await listModules(page, perPage, token);
        break;
      }

      case 'get': {
        const slug = getRequiredArg(args, 0, 'slug');
        result = await getModule(slug, token);

        // Save to file if requested
        if (args.flags['save-to-file']) {
          const filepath = saveToFile('module', slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }

      case 'create': {
        const title = getOptionalFlag(args, 'title');
        const slug = getOptionalFlag(args, 'slug');
        const type = getOptionalFlag(args, 'type', 'normal');
        const status = getOptionalFlag(args, 'status', 'draft');

        if (!title || !slug) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--title', '--slug'],
            optional: ['--type (default: normal)', '--status (default: draft)', '--description', '--position']
          }, null, 2));
          process.exit(1);
        }

        const createData: any = {
          title,
          slug,
          type,
          editorial_status: status,
          description: args.flags.description || title,
        };
        if (args.flags.position !== undefined) {
          createData.position = parseInt(args.flags.position, 10);
        }

        result = await createModule(createData, token);
        break;
      }

      case 'update': {
        const slug = getRequiredArg(args, 0, 'slug');
        const updateData: any = {};

        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        if (args.flags.type) updateData.type = args.flags.type;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags.position !== undefined) {
          updateData.position = parseInt(args.flags.position, 10);
        }

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--title', '--description', '--type', '--status', '--position']
          }, null, 2));
          process.exit(1);
        }

        result = await updateModule(slug, updateData, token);
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

        await deleteModule(slug, token);
        result = { success: true, message: 'Module deleted successfully' };
        break;
      }

      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ['list', 'get', 'create', 'update', 'delete']
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
  console.log(`Module CLI - Manage modules

USAGE:
  npm run module:<operation> [args] [flags]

OPERATIONS:
  list                List all modules (paginated)
  get <slug>          Get a specific module
  create              Create a new module
  update <slug>       Update an existing module
  delete <slug>       Delete a module (requires --confirm)

EXAMPLES:

  List Operations:
    # First page (default: 20 items)
    npm run module:list

    # Page 2 with 10 items
    npm run module:list -- --page=2 --per-page=10

  Get Operations:
    # Get module with all lessons
    npm run module:get relationale-datenbanken

    # Get and save to backups/
    npm run module:get relationale-datenbanken -- --save-to-file

  Create Operations:
    # Create draft module
    npm run module:create \\
      --title="Neues Modul" \\
      --slug="neues-modul" \\
      --type="normal" \\
      --status="draft" \\
      --description="Modul Beschreibung"

    # Create published exam prep module
    npm run module:create \\
      --title="Pruefungsvorbereitung SQL" \\
      --slug="pruefung-sql" \\
      --type="exam_prep" \\
      --status="published" \\
      --position=1

  Update Operations:
    # Update title only
    npm run module:update relationale-datenbanken -- --title="Neue Datenbanken"

    # Update multiple fields
    npm run module:update test-modul \\
      -- --title="Updated Title" \\
      --description="Updated description" \\
      --status="published"

    # Change position
    npm run module:update test-modul -- --position=5

  Delete Operations:
    # Delete module (requires --confirm for safety)
    npm run module:delete old-module -- --confirm

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
    npm run module:list | jq '.data[] | "\\(.id) \\(.title)"'
    npm run module:get slug | jq '.lessons | length'
`);
}

