/**
 * Discussion CLI - Command line interface for discussion thread management
 *
 * Direct API implementation for the Discussions API v1.
 *
 * Usage:
 *   npm run discussion:list [--status=open|solved|all] [--page=N] [--limit=N]
 *   npm run discussion:get <thread-id>
 *   npm run discussion:comment <thread-id> -- --content="..." --author-email="..."
 *   npm run discussion:solve <thread-id> -- --actor-email="..." [--accepted-comment-id=N]
 *   npm run discussion:unsolve <thread-id> -- --actor-email="..."
 *   npm run discussion:update-comment <comment-id> -- --content="..." --actor-email="..."
 *   npm run discussion:delete-comment <comment-id> -- --actor-email="..." --confirm
 *   npm run discussion:accept <comment-id> -- --actor-email="..."
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getTextData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface Author {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  is_platform_admin: boolean;
}

interface LessonContext {
  id: number;
  slug: string;
  title: string;
  description: string | null;
}

interface ModuleContext {
  id: number;
  slug: string;
  title: string;
}

interface LearningPathContext {
  id: number;
  slug: string;
  title: string;
}

interface ThreadContext {
  lesson: LessonContext;
  module: ModuleContext | null;
  learning_path: LearningPathContext | null;
}

interface ThreadUrls {
  thread: string;
  lesson_api: string | null;
  module_api: string | null;
}

interface Comment {
  id: number;
  thread_id: number;
  content: string;
  author: Author;
  is_accepted_answer: boolean;
  created_at: string;
  updated_at: string;
}

interface ThreadData {
  id: number;
  title: string;
  content: string;
  author: Author;
  is_solved: boolean;
  accepted_comment_id: number | null;
  comments_count: number;
  created_at: string;
  updated_at: string;
  context: ThreadContext;
  urls: ThreadUrls;
  comments?: Comment[];
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
  links: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
}

// Valid status values
const VALID_STATUSES = ['open', 'solved', 'all'];

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/discussions`;
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

async function listThreads(
  params: {
    status?: string;
    limit?: number;
    page?: number;
  },
  token: string
): Promise<PaginatedResponse<ThreadData>> {
  const queryParams = new URLSearchParams();

  if (params.status) queryParams.append('status', params.status);
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.page) queryParams.append('page', params.page.toString());

  const url = `${getApiBaseUrl()}/threads?${queryParams.toString()}`;
  const startTime = Date.now();

  console.error(`\nListing discussion threads from API...`);
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

async function getThread(
  id: number,
  token: string
): Promise<{ data: ThreadData }> {
  const url = `${getApiBaseUrl()}/threads/${id}`;
  const startTime = Date.now();

  console.error(`\nGetting discussion thread from API...`);
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

async function createComment(
  threadId: number,
  data: {
    content: string;
    author_email: string;
  },
  token: string
): Promise<{ message: string; data: Comment }> {
  const url = `${getApiBaseUrl()}/threads/${threadId}/comments`;
  const startTime = Date.now();

  console.error(`\nCreating comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Author: ${data.author_email}`);
  console.error(`   Content: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`);
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

async function solveThread(
  threadId: number,
  data: {
    actor_email: string;
    accepted_comment_id?: number;
  },
  token: string
): Promise<{ message: string; data: { id: number; is_solved: boolean; accepted_comment_id: number | null } }> {
  const url = `${getApiBaseUrl()}/threads/${threadId}/solve`;
  const startTime = Date.now();

  console.error(`\nMarking thread as solved via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Actor: ${data.actor_email}`);
  if (data.accepted_comment_id) console.error(`   Accepted Comment ID: ${data.accepted_comment_id}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PATCH',
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

async function unsolveThread(
  threadId: number,
  data: {
    actor_email: string;
  },
  token: string
): Promise<{ message: string; data: { id: number; is_solved: boolean; accepted_comment_id: null } }> {
  const url = `${getApiBaseUrl()}/threads/${threadId}/unsolve`;
  const startTime = Date.now();

  console.error(`\nMarking thread as unsolved via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Thread ID: ${threadId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PATCH',
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

async function updateComment(
  commentId: number,
  data: {
    content: string;
    actor_email: string;
  },
  token: string
): Promise<{ message: string; data: Comment }> {
  const url = `${getApiBaseUrl()}/comments/${commentId}`;
  const startTime = Date.now();

  console.error(`\nUpdating comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Content: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'PATCH',
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

async function deleteComment(
  commentId: number,
  data: {
    actor_email: string;
  },
  token: string
): Promise<void> {
  const url = `${getApiBaseUrl()}/comments/${commentId}`;
  const startTime = Date.now();

  console.error(`\nDeleting comment via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
  console.error(`   Timeout: 60 seconds\n`);

  const response = await fetchWithRetry(url, {
    method: 'DELETE',
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

  // 204 No Content - no response body
}

async function acceptComment(
  commentId: number,
  data: {
    actor_email: string;
  },
  token: string
): Promise<{ message: string; data: { thread_id: number; accepted_comment_id: number; is_solved: boolean } }> {
  const url = `${getApiBaseUrl()}/comments/${commentId}/accept`;
  const startTime = Date.now();

  console.error(`\nAccepting comment as answer via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Comment ID: ${commentId}`);
  console.error(`   Actor: ${data.actor_email}`);
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

// ============================================================================
// Main
// ============================================================================

export async function run(argv: string[]): Promise<void> {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));
  try {
    // Check for help flag anywhere in args
    if (!operation || operation === 'help' || operation === '--help' || args.flags.help) {
      printHelp();
      return;
    }

    const token = getAuthToken();
    let result;

    switch (operation) {
      case 'list': {
        const status = getOptionalFlag(args, 'status', 'open');
        const limit = parseInt(getOptionalFlag(args, 'limit', '20'), 10);
        const page = parseInt(getOptionalFlag(args, 'page', '1'), 10);

        // Validate status if provided
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

      case 'get': {
        const idStr = getRequiredArg(args, 0, 'thread-id');
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error('Thread ID must be a number');
        }
        result = await getThread(id, token);
        break;
      }

      case 'comment': {
        const threadIdStr = getRequiredArg(args, 0, 'thread-id');
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error('Thread ID must be a number');
        }

        const authorEmail = getOptionalFlag(args, 'author-email');
        const content = getTextData(args, 'content');

        if (!content || !authorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--content', '--author-email'],
            alternatives: {
              '--content-base64': 'Base64-encoded content',
              '--content-stdin': 'Read content from stdin'
            }
          }, null, 2));
          process.exit(1);
        }

        if (content.length > 10000) {
          console.error(JSON.stringify({
            error: 'Content exceeds maximum length of 10,000 characters',
            length: content.length
          }, null, 2));
          process.exit(1);
        }

        result = await createComment(threadId, { content, author_email: authorEmail }, token);
        break;
      }

      case 'solve': {
        const threadIdStr = getRequiredArg(args, 0, 'thread-id');
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error('Thread ID must be a number');
        }

        const actorEmail = getOptionalFlag(args, 'actor-email');
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required field: --actor-email',
            example: 'npm run discussion:solve 123 -- --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }

        const acceptedCommentIdStr = getOptionalFlag(args, 'accepted-comment-id');
        const solveData: { actor_email: string; accepted_comment_id?: number } = {
          actor_email: actorEmail,
        };

        if (acceptedCommentIdStr) {
          const acceptedCommentId = parseInt(acceptedCommentIdStr, 10);
          if (isNaN(acceptedCommentId)) {
            throw new Error('Accepted comment ID must be a number');
          }
          solveData.accepted_comment_id = acceptedCommentId;
        }

        result = await solveThread(threadId, solveData, token);
        break;
      }

      case 'unsolve': {
        const threadIdStr = getRequiredArg(args, 0, 'thread-id');
        const threadId = parseInt(threadIdStr, 10);
        if (isNaN(threadId)) {
          throw new Error('Thread ID must be a number');
        }

        const actorEmail = getOptionalFlag(args, 'actor-email');
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required field: --actor-email',
            example: 'npm run discussion:unsolve 123 -- --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }

        result = await unsolveThread(threadId, { actor_email: actorEmail }, token);
        break;
      }

      case 'update-comment': {
        const commentIdStr = getRequiredArg(args, 0, 'comment-id');
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error('Comment ID must be a number');
        }

        const actorEmail = getOptionalFlag(args, 'actor-email');
        const content = getTextData(args, 'content');

        if (!content || !actorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--content', '--actor-email'],
            alternatives: {
              '--content-base64': 'Base64-encoded content',
              '--content-stdin': 'Read content from stdin'
            }
          }, null, 2));
          process.exit(1);
        }

        if (content.length > 10000) {
          console.error(JSON.stringify({
            error: 'Content exceeds maximum length of 10,000 characters',
            length: content.length
          }, null, 2));
          process.exit(1);
        }

        result = await updateComment(commentId, { content, actor_email: actorEmail }, token);
        break;
      }

      case 'delete-comment': {
        const commentIdStr = getRequiredArg(args, 0, 'comment-id');
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error('Comment ID must be a number');
        }

        const actorEmail = getOptionalFlag(args, 'actor-email');
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required field: --actor-email',
            example: 'npm run discussion:delete-comment 789 -- --actor-email="support@ausbildung-in-der-it.de" --confirm'
          }, null, 2));
          process.exit(1);
        }

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        await deleteComment(commentId, { actor_email: actorEmail }, token);
        result = { message: 'Comment deleted successfully' };
        break;
      }

      case 'accept': {
        const commentIdStr = getRequiredArg(args, 0, 'comment-id');
        const commentId = parseInt(commentIdStr, 10);
        if (isNaN(commentId)) {
          throw new Error('Comment ID must be a number');
        }

        const actorEmail = getOptionalFlag(args, 'actor-email');
        if (!actorEmail) {
          console.error(JSON.stringify({
            error: 'Missing required field: --actor-email',
            example: 'npm run discussion:accept 789 -- --actor-email="support@ausbildung-in-der-it.de"'
          }, null, 2));
          process.exit(1);
        }

        result = await acceptComment(commentId, { actor_email: actorEmail }, token);
        break;
      }

      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ['list', 'get', 'comment', 'solve', 'unsolve', 'update-comment', 'delete-comment', 'accept']
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
  console.log(`Discussion CLI - Manage discussion threads and comments

USAGE:
  npm run discussion:<operation> [args] [flags]

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
    npm run discussion:list
    npm run discussion:list -- --status=open --limit=10
    npm run discussion:list -- --status=solved --page=2
    npm run discussion:list -- --status=all --limit=50

  GET SINGLE THREAD (with comments):
    npm run discussion:get 123

  CREATE COMMENT:
    npm run discussion:comment 123 -- --content="Hier ist meine Antwort..." --author-email="support@ausbildung-in-der-it.de"

  CREATE COMMENT (with heredoc for long content):
    npm run discussion:comment 123 -- --author-email="support@ausbildung-in-der-it.de" --content-stdin <<'EOF'
    LEFT JOIN gibt alle Zeilen aus der linken Tabelle zurueck,
    auch wenn es keine passenden Zeilen in der rechten Tabelle gibt.

    Beispiel:
    SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id;
    EOF

  CREATE COMMENT (with Base64 content):
    npm run discussion:comment 123 -- --author-email="support@ausbildung-in-der-it.de" \\
      --content-base64="$(echo 'Meine Antwort' | base64)"

  MARK THREAD AS SOLVED:
    npm run discussion:solve 123 -- --actor-email="support@ausbildung-in-der-it.de"

  MARK THREAD AS SOLVED (with accepted answer):
    npm run discussion:solve 123 -- --actor-email="support@ausbildung-in-der-it.de" --accepted-comment-id=789

  MARK THREAD AS UNSOLVED:
    npm run discussion:unsolve 123 -- --actor-email="support@ausbildung-in-der-it.de"

  UPDATE COMMENT:
    npm run discussion:update-comment 789 -- --content="Korrigierte Antwort..." --actor-email="support@ausbildung-in-der-it.de"

  DELETE COMMENT:
    npm run discussion:delete-comment 789 -- --actor-email="support@ausbildung-in-der-it.de" --confirm

  ACCEPT COMMENT AS ANSWER:
    npm run discussion:accept 789 -- --actor-email="support@ausbildung-in-der-it.de"

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

OUTPUT:
  All commands return raw JSON from the API.
  Use jq for custom formatting:
    npm run discussion:list | jq '.data[] | "\\(.id) - \\(.title)"'
    npm run discussion:get 123 | jq '.data.comments | length'

NOTES:
  - Content maximum length is 10,000 characters
  - Only platform admins can create/update/delete comments via CLI
  - The --actor-email and --author-email must belong to a platform admin
  - Use heredoc (--content-stdin) or Base64 for multi-line content
`);
}

