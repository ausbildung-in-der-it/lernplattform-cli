/**
 * Learning Path CLI - Command line interface for learning path management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   lernplattform path list [--page=N] [--per-page=N]
 *   lernplattform path get <slug>
 *   lernplattform path create --title="..." --slug="..." --status="draft"
 *   lernplattform path update <slug> --title="..."
 *   lernplattform path delete <slug> --confirm
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag } from '../utils/args';
import { saveToFile } from '../utils/save';


// ============================================================================
// Types
// ============================================================================

interface LearningPathData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  editorial_status: string;
  is_preview: boolean;
  stripe_price_id: string | null;
  access_duration_months: number | null;
  modules?: any[];
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
  return `${hostUrl}/api/content-cli/v1/learning-paths`;
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

async function listLearningPaths(
  page: number,
  perPage: number,
  token: string
): Promise<PaginatedResponse<LearningPathData>> {
  const url = `${getApiBaseUrl()}?page=${page}&per_page=${perPage}`;
  const startTime = Date.now();

  console.error(`\nListing learning paths from API...`);
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

async function getLearningPath(
  slug: string,
  token: string
): Promise<LearningPathData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nGetting learning path from API...`);
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

async function createLearningPath(
  data: {
    title: string;
    slug: string;
    editorial_status: string;
    description?: string;
    image_url?: string;
    is_preview?: boolean;
    stripe_price_id?: string;
    access_duration_months?: number;
  },
  token: string
): Promise<LearningPathData> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  console.error(`\nCreating learning path via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Title: ${data.title}`);
  console.error(`   Slug: ${data.slug}`);
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

async function updateLearningPath(
  slug: string,
  data: {
    title?: string;
    description?: string;
    editorial_status?: string;
    image_url?: string;
    is_preview?: boolean;
    stripe_price_id?: string;
    access_duration_months?: number;
  },
  token: string
): Promise<LearningPathData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nUpdating learning path via API...`);
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

async function deleteLearningPath(
  slug: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nDeleting learning path via API...`);
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
        result = await listLearningPaths(page, perPage, token);
        break;
      }

      case 'get': {
        const slug = getRequiredArg(args, 0, 'slug');
        result = await getLearningPath(slug, token);

        // Save to file if requested
        if (args.flags['save-to-file']) {
          const filepath = saveToFile('path', slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }

      case 'create': {
        const title = getOptionalFlag(args, 'title');
        const slug = getOptionalFlag(args, 'slug');
        const status = getOptionalFlag(args, 'status', 'draft');

        if (!title || !slug) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--title', '--slug'],
            optional: ['--status (default: draft)', '--description', '--image-url', '--access-duration', '--price-id']
          }, null, 2));
          process.exit(1);
        }

        const createData: any = {
          title,
          slug,
          editorial_status: status,
        };

        if (args.flags.description) createData.description = args.flags.description;
        if (args.flags['image-url']) createData.image_url = args.flags['image-url'];
        if (args.flags['is-preview'] !== undefined) {
          createData.is_preview = args.flags['is-preview'] === 'true' || args.flags['is-preview'] === true;
        }
        if (args.flags['price-id']) createData.stripe_price_id = args.flags['price-id'];
        if (args.flags['access-duration']) {
          createData.access_duration_months = parseInt(args.flags['access-duration'], 10);
        }

        result = await createLearningPath(createData, token);
        break;
      }

      case 'update': {
        const slug = getRequiredArg(args, 0, 'slug');
        const updateData: any = {};

        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        if (args.flags.status) updateData.editorial_status = args.flags.status;
        if (args.flags['image-url']) updateData.image_url = args.flags['image-url'];
        if (args.flags['is-preview'] !== undefined) {
          updateData.is_preview = args.flags['is-preview'] === 'true' || args.flags['is-preview'] === true;
        }
        if (args.flags['price-id']) updateData.stripe_price_id = args.flags['price-id'];
        if (args.flags['access-duration']) {
          updateData.access_duration_months = parseInt(args.flags['access-duration'], 10);
        }

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--title', '--description', '--status', '--image-url', '--is-preview', '--price-id', '--access-duration']
          }, null, 2));
          process.exit(1);
        }

        result = await updateLearningPath(slug, updateData, token);
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

        await deleteLearningPath(slug, token);
        result = { success: true, message: 'Learning path deleted successfully' };
        break;
      }

      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ['list', 'get', 'create', 'update', 'delete']
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

