/**
 * Rating CLI - Command line interface for rating management
 *
 * Direct API implementation for the Ratings API v1.
 *
 * Usage:
 *   lernplattform rating list [--content-type=...] [--page=N] [--per-page=N]
 *   lernplattform rating get <id>
 *   lernplattform rating summary --content-type=... [--content-id=N]
 *   lernplattform rating user --content-type=... [--content-id=N]
 *   lernplattform rating create --content-type=... --rating=N [--content-id=N] [--comment="..."]
 *   lernplattform rating update <id> -- [--rating=N] [--comment="..."]
 *   lernplattform rating delete <id> --confirm
 */

import { parseCliArgs, getRequiredArg, getOptionalFlag, getTextData } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface RatingUser {
  id: number;
  name: string;
  avatar_url: string | null;
}

interface RatingData {
  id: number;
  content_type: string;
  content_id: number | null;
  content_title: string | null;
  content_slug: string | null;
  rating: number;
  comment: string | null;
  reviewed: boolean;
  user: RatingUser;
  created_at: string;
  updated_at: string;
}

interface RatingSummary {
  content_type: string;
  content_id: number | null;
  average: number;
  count: number;
  distribution: Record<string, number>;
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

// Valid content types
const VALID_CONTENT_TYPES = ['lesson', 'practice_task', 'learning_path', 'card', 'platform'];

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/ratings`;
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

async function listRatings(
  params: {
    contentType?: string;
    contentId?: number;
    userId?: number;
    minRating?: number;
    maxRating?: number;
    hasComment?: boolean;
    reviewed?: boolean;
    sort?: string;
    page?: number;
    perPage?: number;
  },
  token: string
): Promise<PaginatedResponse<RatingData>> {
  const queryParams = new URLSearchParams();

  if (params.contentType) queryParams.append('content_type', params.contentType);
  if (params.contentId) queryParams.append('content_id', params.contentId.toString());
  if (params.userId) queryParams.append('user_id', params.userId.toString());
  if (params.minRating) queryParams.append('min_rating', params.minRating.toString());
  if (params.maxRating) queryParams.append('max_rating', params.maxRating.toString());
  if (params.hasComment !== undefined) queryParams.append('has_comment', params.hasComment.toString());
  if (params.reviewed !== undefined) queryParams.append('reviewed', params.reviewed.toString());
  if (params.sort) queryParams.append('sort', params.sort);
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.perPage) queryParams.append('per_page', params.perPage.toString());

  const url = `${getApiBaseUrl()}?${queryParams.toString()}`;
  const startTime = Date.now();

  console.error(`\nListing ratings from API...`);
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

async function getRating(
  id: number,
  token: string
): Promise<{ data: RatingData }> {
  const url = `${getApiBaseUrl()}/${id}`;
  const startTime = Date.now();

  console.error(`\nGetting rating from API...`);
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

async function getSummary(
  contentType: string,
  contentId: number | null,
  token: string
): Promise<{ data: RatingSummary }> {
  const queryParams = new URLSearchParams();
  queryParams.append('content_type', contentType);
  if (contentId !== null) {
    queryParams.append('content_id', contentId.toString());
  }

  const url = `${getApiBaseUrl()}/summary?${queryParams.toString()}`;
  const startTime = Date.now();

  console.error(`\nGetting rating summary from API...`);
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

async function getUserRating(
  contentType: string,
  contentId: number | null,
  token: string
): Promise<{ data: RatingData | null; message?: string }> {
  const queryParams = new URLSearchParams();
  queryParams.append('content_type', contentType);
  if (contentId !== null) {
    queryParams.append('content_id', contentId.toString());
  }

  const url = `${getApiBaseUrl()}/user?${queryParams.toString()}`;
  const startTime = Date.now();

  console.error(`\nGetting user rating from API...`);
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

async function createRating(
  data: {
    content_type: string;
    content_id?: number;
    rating: number;
    comment?: string;
  },
  token: string
): Promise<{ message: string; data: RatingData }> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  console.error(`\nCreating rating via API...`);
  console.error(`   URL: ${url}`);
  console.error(`   Content Type: ${data.content_type}`);
  if (data.content_id) console.error(`   Content ID: ${data.content_id}`);
  console.error(`   Rating: ${data.rating}`);
  if (data.comment) console.error(`   Comment: ${data.comment.substring(0, 50)}${data.comment.length > 50 ? '...' : ''}`);
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

async function updateRating(
  id: number,
  data: {
    rating?: number;
    comment?: string;
  },
  token: string
): Promise<{ message: string; data: RatingData }> {
  const url = `${getApiBaseUrl()}/${id}`;
  const startTime = Date.now();

  console.error(`\nUpdating rating via API...`);
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

async function deleteRating(
  id: number,
  token: string
): Promise<{ message: string }> {
  const url = `${getApiBaseUrl()}/${id}`;
  const startTime = Date.now();

  console.error(`\nDeleting rating via API...`);
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
        const contentType = getOptionalFlag(args, 'content-type');
        const contentIdStr = getOptionalFlag(args, 'content-id');
        const userIdStr = getOptionalFlag(args, 'user-id');
        const minRatingStr = getOptionalFlag(args, 'min-rating');
        const maxRatingStr = getOptionalFlag(args, 'max-rating');
        const hasCommentStr = getOptionalFlag(args, 'has-comment');
        const reviewedStr = getOptionalFlag(args, 'reviewed');
        const sort = getOptionalFlag(args, 'sort');
        const page = parseInt(getOptionalFlag(args, 'page', '1'), 10);
        const perPage = parseInt(getOptionalFlag(args, 'per-page', '15'), 10);

        // Validate content type if provided
        if (contentType && !VALID_CONTENT_TYPES.includes(contentType)) {
          console.error(JSON.stringify({
            error: `Invalid content type: ${contentType}`,
            valid_types: VALID_CONTENT_TYPES
          }, null, 2));
          process.exit(1);
        }

        result = await listRatings({
          contentType,
          contentId: contentIdStr ? parseInt(contentIdStr, 10) : undefined,
          userId: userIdStr ? parseInt(userIdStr, 10) : undefined,
          minRating: minRatingStr ? parseInt(minRatingStr, 10) : undefined,
          maxRating: maxRatingStr ? parseInt(maxRatingStr, 10) : undefined,
          hasComment: hasCommentStr ? hasCommentStr === 'true' : undefined,
          reviewed: reviewedStr ? reviewedStr === 'true' : undefined,
          sort,
          page,
          perPage,
        }, token);
        break;
      }

      case 'get': {
        const idStr = getRequiredArg(args, 0, 'id');
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error('Rating ID must be a number');
        }
        result = await getRating(id, token);
        break;
      }

      case 'summary': {
        const contentType = getOptionalFlag(args, 'content-type');
        const contentIdStr = getOptionalFlag(args, 'content-id');

        if (!contentType) {
          console.error(JSON.stringify({
            error: 'Missing required flag: --content-type',
            valid_types: VALID_CONTENT_TYPES,
            example: 'lernplattform rating summary --content-type=lesson --content-id=123'
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

        // content_id is required for all types except 'platform'
        if (contentType !== 'platform' && !contentIdStr) {
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

      case 'user': {
        const contentType = getOptionalFlag(args, 'content-type');
        const contentIdStr = getOptionalFlag(args, 'content-id');

        if (!contentType) {
          console.error(JSON.stringify({
            error: 'Missing required flag: --content-type',
            valid_types: VALID_CONTENT_TYPES,
            example: 'lernplattform rating user --content-type=lesson --content-id=123'
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

        // content_id is required for all types except 'platform'
        if (contentType !== 'platform' && !contentIdStr) {
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

      case 'create': {
        const contentType = getOptionalFlag(args, 'content-type');
        const contentIdStr = getOptionalFlag(args, 'content-id');
        const ratingStr = getOptionalFlag(args, 'rating');

        if (!contentType || !ratingStr) {
          console.error(JSON.stringify({
            error: 'Missing required fields',
            required: ['--content-type', '--rating'],
            optional: ['--content-id (required except for platform)', '--comment'],
            valid_types: VALID_CONTENT_TYPES,
            rating_range: '1-5'
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
            error: 'Rating must be a number between 1 and 5',
            provided: ratingStr
          }, null, 2));
          process.exit(1);
        }

        // content_id is required for all types except 'platform'
        if (contentType !== 'platform' && !contentIdStr) {
          console.error(JSON.stringify({
            error: `--content-id is required for content type: ${contentType}`,
            example: `lernplattform rating create --content-type=${contentType} --content-id=123 --rating=5`
          }, null, 2));
          process.exit(1);
        }

        const createData: {
          content_type: string;
          content_id?: number;
          rating: number;
          comment?: string;
        } = {
          content_type: contentType,
          rating,
        };

        if (contentIdStr) {
          createData.content_id = parseInt(contentIdStr, 10);
        }

        // Support: --comment, --comment-base64, --comment-stdin
        const comment = getTextData(args, 'comment');
        if (comment) {
          if (comment.length > 5000) {
            console.error(JSON.stringify({
              error: 'Comment exceeds maximum length of 5000 characters',
              length: comment.length
            }, null, 2));
            process.exit(1);
          }
          createData.comment = comment;
        }

        result = await createRating(createData, token);
        break;
      }

      case 'update': {
        const idStr = getRequiredArg(args, 0, 'id');
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error('Rating ID must be a number');
        }

        const updateData: {
          rating?: number;
          comment?: string;
        } = {};

        const ratingStr = getOptionalFlag(args, 'rating');
        if (ratingStr) {
          const rating = parseInt(ratingStr, 10);
          if (isNaN(rating) || rating < 1 || rating > 5) {
            console.error(JSON.stringify({
              error: 'Rating must be a number between 1 and 5',
              provided: ratingStr
            }, null, 2));
            process.exit(1);
          }
          updateData.rating = rating;
        }

        // Support: --comment, --comment-base64, --comment-stdin
        const comment = getTextData(args, 'comment');
        if (comment) {
          if (comment.length > 5000) {
            console.error(JSON.stringify({
              error: 'Comment exceeds maximum length of 5000 characters',
              length: comment.length
            }, null, 2));
            process.exit(1);
          }
          updateData.comment = comment;
        }

        if (Object.keys(updateData).length === 0) {
          console.error(JSON.stringify({
            error: 'No fields to update',
            available: ['--rating', '--comment', '--comment-stdin', '--comment-base64']
          }, null, 2));
          process.exit(1);
        }

        result = await updateRating(id, updateData, token);
        break;
      }

      case 'delete': {
        const idStr = getRequiredArg(args, 0, 'id');
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          throw new Error('Rating ID must be a number');
        }

        if (!args.flags.confirm) {
          console.error(JSON.stringify({
            error: 'Confirmation required',
            message: 'Use --confirm to proceed with deletion'
          }, null, 2));
          process.exit(1);
        }

        result = await deleteRating(id, token);
        break;
      }

      default:
        console.error(JSON.stringify({
          error: `Unknown operation: ${operation}`,
          available: ['list', 'get', 'summary', 'user', 'create', 'update', 'delete']
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

