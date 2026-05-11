/**
 * Practice Task CLI - Command line interface for practice task management
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   npm run practice:list [--page=N] [--module-id=N] [--search="..."]
 *   npm run practice:get <slug>
 *   npm run practice:create --title="..." --slug="..."
 *   npm run practice:update <slug> -- --difficulty="..."
 *   npm run practice:delete <slug> -- --confirm
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getTextData } from '../utils/args';
import { saveToFile } from '../utils/save';


// ============================================================================
// Types
// ============================================================================

interface PracticeTaskData {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  task_markdown: string | null;
  solution_markdown: string | null;
  schwierigkeitsgrad: string | null;
  module_id: number | null;
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
  return `${hostUrl}/api/content-cli/v1/practice-tasks`;
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

async function listPracticeTasks(
  page: number,
  perPage: number,
  moduleId: number | undefined,
  searchQuery: string | undefined,
  token: string
): Promise<PaginatedResponse<PracticeTaskData>> {
  let url = `${getApiBaseUrl()}?page=${page}&per_page=${perPage}`;
  if (moduleId !== undefined) {
    url += `&module_id=${moduleId}`;
  }
  if (searchQuery) {
    url += `&search=${encodeURIComponent(searchQuery)}`;
  }

  const startTime = Date.now();

  console.error(`\nListing practice tasks from API...`);
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

async function getPracticeTask(
  slug: string,
  token: string
): Promise<PracticeTaskData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nGetting practice task from API...`);
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

async function createPracticeTask(
  data: {
    title: string;
    slug: string;
    description?: string;
    task_markdown?: string;
    solution_markdown?: string;
    schwierigkeitsgrad?: string;
    module_id?: number;
  },
  token: string
): Promise<PracticeTaskData> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  console.error(`\nCreating practice task via API...`);
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

async function updatePracticeTask(
  slug: string,
  data: {
    title?: string;
    description?: string;
    task_markdown?: string;
    solution_markdown?: string;
    schwierigkeitsgrad?: string;
    module_id?: number;
  },
  token: string
): Promise<PracticeTaskData> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nUpdating practice task via API...`);
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

async function deletePracticeTask(
  slug: string,
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/${slug}`;
  const startTime = Date.now();

  console.error(`\nDeleting practice task via API...`);
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
        const moduleIdStr = getOptionalFlag(args, 'module-id');
        const moduleId = moduleIdStr ? parseInt(moduleIdStr, 10) : undefined;
        const searchQuery = getOptionalFlag(args, 'search');

        result = await listPracticeTasks(page, perPage, moduleId, searchQuery, token);
        break;
      }

      case 'get': {
        const slug = getRequiredArg(args, 0, 'slug');
        result = await getPracticeTask(slug, token);

        // Save to file if requested
        if (args.flags['save-to-file']) {
          const filepath = saveToFile('practice', slug, result);
          console.error(`Saved to: ${filepath}`);
        }
        break;
      }

      case 'create': {
        const title = getOptionalFlag(args, 'title');
        const slug = getOptionalFlag(args, 'slug');

        if (!title || !slug) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--title', '--slug'],
            optional: ['--description', '--task-markdown', '--solution-markdown', '--difficulty', '--module-id']
          }, null, 2));
          process.exit(1);
        }

        const createData: any = {
          title,
          slug,
        };

        if (args.flags.description) createData.description = args.flags.description;
        // Support: --task-markdown, --task-markdown-base64, --task-markdown-stdin
        const taskMarkdown = getTextData(args, 'task-markdown');
        if (taskMarkdown) createData.task_markdown = taskMarkdown;
        // Support: --solution-markdown, --solution-markdown-base64, --solution-markdown-stdin
        const solutionMarkdown = getTextData(args, 'solution-markdown');
        if (solutionMarkdown) createData.solution_markdown = solutionMarkdown;
        if (args.flags.difficulty) createData.schwierigkeitsgrad = args.flags.difficulty;
        if (args.flags['module-id']) {
          createData.module_id = parseInt(args.flags['module-id'], 10);
        }
        if (args.flags['content-type']) createData.content_type = args.flags['content-type'];

        result = await createPracticeTask(createData, token);
        break;
      }

      case 'update': {
        const slug = getRequiredArg(args, 0, 'slug');
        const updateData: any = {};

        if (args.flags.title) updateData.title = args.flags.title;
        if (args.flags.description) updateData.description = args.flags.description;
        // Support: --task-markdown, --task-markdown-base64, --task-markdown-stdin
        const taskMarkdown = getTextData(args, 'task-markdown');
        if (taskMarkdown) updateData.task_markdown = taskMarkdown;
        // Support: --solution-markdown, --solution-markdown-base64, --solution-markdown-stdin
        const solutionMarkdown = getTextData(args, 'solution-markdown');
        if (solutionMarkdown) updateData.solution_markdown = solutionMarkdown;
        if (args.flags.difficulty) updateData.schwierigkeitsgrad = args.flags.difficulty;
        if (args.flags['module-id']) {
          updateData.module_id = parseInt(args.flags['module-id'], 10);
        }
        if (args.flags['content-type']) updateData.content_type = args.flags['content-type'];

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--title', '--description', '--task-markdown', '--solution-markdown', '--difficulty', '--module-id']
          }, null, 2));
          process.exit(1);
        }

        result = await updatePracticeTask(slug, updateData, token);
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

        await deletePracticeTask(slug, token);
        result = { success: true, message: 'Practice task deleted successfully' };
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
  console.log(`Practice Task CLI - Manage practice tasks

USAGE:
  npm run practice:<operation> [args] [flags]

OPERATIONS:
  list                List all practice tasks
  get <slug>          Get a specific practice task
  create              Create a new practice task
  update <slug>       Update an existing practice task
  delete <slug>       Delete a practice task (requires --confirm)

EXAMPLES:

  List Practice Tasks:
    npm run practice:list
    npm run practice:list -- --page=2 --per-page=10
    npm run practice:list -- --module-id=17
    npm run practice:list -- --search="nslookup"
    npm run practice:list -- --module-id=17 --search="DNS"

  Get Practice Task:
    npm run practice:get anwendung-von-nslookup
    npm run practice:get task-slug -- --save-to-file

  Create Practice Task (Basic):
    npm run practice:create \\
      --title="DNS Troubleshooting mit nslookup" \\
      --slug="dns-troubleshooting-nslookup" \\
      --module-id=17 \\
      --difficulty="mittel" \\
      --description="Lerne DNS-Probleme mit nslookup zu diagnostizieren"

  Create Practice Task with Markdown Content (Heredoc):
    npm run practice:create \\
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
    # Lösung

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
    TASK_CONTENT=\$(cat <<'EOF' | base64
    # Aufgabe: REST API implementieren
    Erstelle eine REST API mit Express.js.
    EOF
    )
    SOLUTION_CONTENT=\$(cat <<'EOF' | base64
    # Lösung
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
    npm run practice:create \\
      --title="REST API mit Express" \\
      --slug="rest-api-express" \\
      --module-id=10 \\
      --difficulty="schwer" \\
      --task-markdown-base64="\$TASK_CONTENT" \\
      --solution-markdown-base64="\$SOLUTION_CONTENT"

  Update Practice Task:
    npm run practice:update dns-troubleshooting -- --difficulty="schwer"
    npm run practice:update task-slug -- --title="Neuer Titel"
    npm run practice:update task-slug -- \\
      --description="Aktualisierte Beschreibung" \\
      --difficulty="einfach"

  Update Task Content with Heredoc:
    npm run practice:update arrays-sortieren -- --task-markdown-stdin <<'EOF'
    # Aktualisierte Aufgabe

    Implementiere Quicksort statt Bubblesort.
    EOF

  Delete Practice Task:
    npm run practice:delete old-task -- --confirm

  Backup Before Changes:
    npm run practice:get my-task -- --save-to-file

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
     npm run practice:create \\
       --title="Meine Aufgabe" \\
       --slug="meine-aufgabe" \\
       --module-id=5 \\
       --difficulty="mittel" \\
       --description="Kurze Beschreibung" \\
       --task-markdown-stdin \\
       --solution-markdown-stdin <<'TASK_EOF' <<'SOLUTION_EOF'
     # Aufgabe hier
     TASK_EOF
     # Lösung hier
     SOLUTION_EOF

  2. Update Task Content from File:
     cat task-content.md | npm run practice:update my-task -- --task-markdown-stdin
     cat solution.md | npm run practice:update my-task -- --solution-markdown-stdin

  3. Backup Before Major Changes:
     npm run practice:get my-task -- --save-to-file
     npm run practice:update my-task -- --difficulty="schwer"

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

