/**
 * AIDI Search CLI - Search platform content
 *
 * Direct API implementation without tool dependency.
 *
 * Usage:
 *   lernplattform search "<query>"
 */

import { parseCliArgs, getRequiredArg } from '../utils/args';


// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  type: string;
  id: number;
  title: string;
  slug: string;
  description: string | null;
  module_title: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/search`;
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
// Main
// ============================================================================

async function search(query: string, token: string): Promise<SearchResponse> {
  const url = `${getApiBaseUrl()}?q=${encodeURIComponent(query)}`;
  const startTime = Date.now();

  console.error(`\nSearching AIDI platform...`);
  console.error(`   URL: ${url}`);
  console.error(`   Query: ${query}`);
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

export async function run(argv: string[]): Promise<void> {
  const args = parseCliArgs(argv);
  try {
    if (args.flags.help || args.positional.length === 0) {
      printHelp();
      return;
    }

    const query = getRequiredArg(args, 0, 'search query');
    const token = getAuthToken();

    const result = await search(query, token);

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`AIDI Search CLI - Search platform content

DESCRIPTION:
  Search the AIDI platform for lessons, modules, practice tasks, and videos.
  Returns content that matches your query with metadata for navigation.

USAGE:
  lernplattform search "<query>"

ARGUMENTS:
  query           Search term or phrase to find in platform content

FLAGS:
  --help          Show this help message

EXAMPLES:
  # Search for networking topics
  lernplattform search "IPv4"

  # Find database lessons
  lernplattform search "SQL JOIN"

  # Search for command-line tools
  lernplattform search "nslookup"

  # Multi-word queries
  lernplattform search "object oriented programming"

  # Search for specific concepts
  lernplattform search "normalisierung datenbank"

OUTPUT FORMAT:
  Laravel paginator. Treffer in '.data', Gesamtzahl in '.meta.total':

  {
    "data": [
      {
        "type": "lesson",              // lesson | module | practice_task | video
        "id": 123,                     // numeric ID
        "title": "SQL Grundlagen",
        "slug": "sql-grundlagen",      // URL-friendly identifier
        "description": "..."           // null wenn nicht gesetzt
      }
    ],
    "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
    "meta":  { "current_page": 1, "per_page": 15, "total": 5, "last_page": 1 }
  }

  Praktisches jq:
    .data[]                            # alle Treffer
    .data[] | select(.type=="lesson")  # nur Lessons
    .meta.total                        # Gesamtanzahl

USE CASES:
  - Find lessons on specific topics before analysis
  - Discover related content for curriculum planning
  - Locate practice tasks for a concept
  - Search before creating new content (avoid duplicates)
  - Build navigation or content recommendations

TIPS:
  - Use specific technical terms: "JOIN" not "combine tables"
  - German terms work: "Einführung", "Grundlagen"
  - Search is case-insensitive
  - Partial matches are included
  - Results include content from title, description, and body

ENVIRONMENT:
  AIDI_HOST_URL          # API host (default: production)
  AIDI_API_TOKEN         # Required: API authentication token

CONFIGURATION:
  - Timeout: 60 seconds
  - Retries: 3 attempts with exponential backoff
  - Default host: https://app.ausbildung-in-der-it.de

TROUBLESHOOTING:
  "AIDI_API_TOKEN not set"
    → Add AIDI_API_TOKEN to your .env file

  "HTTP 404"
    → Verify AIDI_HOST_URL points to correct environment
    → Ensure search endpoint exists on your environment

  "HTTP 401 Unauthorized"
    → Check that AIDI_API_TOKEN is valid for current environment

  Timeout errors
    → Large result sets may take longer
    → Check network connectivity
    → Verify API is responding

MORE HELP:
  CLI Documentation:     CLI.md
  Environment Config:    ENV_CONFIG.md
  Project Overview:      README.md
`);
}

