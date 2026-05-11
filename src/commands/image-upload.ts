/**
 * Image Upload CLI - Upload images to AIDI platform storage
 *
 * Uploads local images to the AIDI API and returns CDN URLs for embedding.
 *
 * Usage:
 *   npm run image:upload <file-path> [--directory=<dir>] [--json]
 *
 * Examples:
 *   npm run image:upload ./images/diagram.png
 *   npm run image:upload ./images/diagram.png -- --directory=lessons/arrays
 *   npm run image:upload ./images/*.png -- --directory=lessons/arrays
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs, getOptionalFlag } from '../utils/args';
import { glob } from 'glob';


// ============================================================================
// Types
// ============================================================================

interface ImageUploadResponse {
  url: string;
  path: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
}

// ============================================================================
// API Functions
// ============================================================================

function getApiBaseUrl(): string {
  const hostUrl = process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
  return `${hostUrl}/api/content-cli/v1/images`;
}

function getAuthToken(): string {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error('AIDI_API_TOKEN not set. Please set it in your .env file.');
  }
  return token;
}

async function uploadImage(
  filePath: string,
  directory: string | undefined,
  token: string,
  json: boolean
): Promise<ImageUploadResponse> {
  const url = getApiBaseUrl();
  const startTime = Date.now();

  // Validate file exists
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Get file info
  const stats = fs.statSync(absolutePath);
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (stats.size > maxSize) {
    throw new Error(
      `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum: 10MB`
    );
  }

  const filename = path.basename(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();

  // Validate file type
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Unsupported file type: ${ext}. Allowed: ${allowedExtensions.join(', ')}`
    );
  }

  if (!json) {
    console.log(`\n📤 Uploading image to API...`);
    console.log(`   URL: ${url}`);
    console.log(`   File: ${filename}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
    if (directory) {
      console.log(`   Directory: ${directory}`);
    }
    console.log(`   Timeout: 60 seconds\n`);
  }

  // Create FormData
  const formData = new FormData();

  // Read file and create blob
  const fileBuffer = fs.readFileSync(absolutePath);
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('image', blob, filename);

  if (directory) {
    formData.append('directory', directory);
  }

  // Send request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'No error body');
    if (!json) {
      console.log(`   ❌ HTTP ${response.status}: ${errorText}\n`);
    }
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json() as ImageUploadResponse;

  if (!json) {
    console.log(`   ✅ Response received in ${(duration / 1000).toFixed(2)}s`);
    console.log(`   📎 URL: ${data.url}\n`);
  }

  return data;
}

// ============================================================================
// Main
// ============================================================================

export async function run(argv: string[]): Promise<void> {
  const args = parseCliArgs(argv);
  try {
    if (args.flags.help || args.positional.length === 0) {
      printHelp();
      return;
    }

    const json = getOptionalFlag(args, 'json', false);
    const directory = getOptionalFlag(args, 'directory', undefined) as string | undefined;

    // Get auth token
    const token = getAuthToken();

    // Collect files (support glob patterns)
    const filePatterns = args.positional;
    let files: string[] = [];

    for (const pattern of filePatterns) {
      if (pattern.includes('*')) {
        // Glob pattern
        const matches = await glob(pattern);
        files.push(...matches);
      } else {
        files.push(pattern);
      }
    }

    // Filter to only image files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    files = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return imageExtensions.includes(ext);
    });

    if (files.length === 0) {
      throw new Error('No image files found matching the provided pattern(s).');
    }

    // Upload files
    const results: ImageUploadResponse[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
      try {
        const result = await uploadImage(file, directory, token, json);
        results.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ file, error: errorMsg });
        if (!json) {
          console.error(`   ❌ Failed to upload ${file}: ${errorMsg}`);
        }
      }
    }

    // Output results
    if (json) {
      console.log(JSON.stringify({
        success: results,
        errors: errors.length > 0 ? errors : undefined,
        total: files.length,
        uploaded: results.length,
        failed: errors.length,
      }, null, 2));
    } else {
      if (results.length > 0) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('                        UPLOAD SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log(`✅ Successfully uploaded: ${results.length}/${files.length}\n`);

        console.log('URLs for embedding:\n');
        for (const result of results) {
          console.log(`  ${result.original_filename}:`);
          console.log(`    ${result.url}\n`);
        }

        if (errors.length > 0) {
          console.log(`\n❌ Failed: ${errors.length}`);
          for (const err of errors) {
            console.log(`  - ${err.file}: ${err.error}`);
          }
        }
      }
    }

    // Exit with error code if any uploads failed
    if (errors.length > 0 && results.length === 0) {
      process.exit(1);
    }

  } catch (error) {
    if (args.flags.json) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }, null, 2));
    } else {
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  }
}

function printHelp() {
  console.log(`Image Upload CLI - Upload images to AIDI platform storage

╔══════════════════════════════════════════════════════════════════════════╗
║                           IMAGE UPLOAD                                    ║
╚══════════════════════════════════════════════════════════════════════════╝

DESCRIPTION:
  Upload local images to the AIDI platform storage and get CDN URLs
  for embedding in lessons and content blocks.

USAGE:
  npm run image:upload <file-path> [options]
  npm run image:upload <glob-pattern> [options]

EXAMPLES:
  # Upload single image
  npm run image:upload ./images/diagram.png

  # Upload to specific directory
  npm run image:upload ./images/diagram.png -- --directory=lessons/arrays

  # Upload multiple images with glob pattern
  npm run image:upload "./images/*.png" -- --directory=lessons/arrays

  # JSON output for scripting
  npm run image:upload ./images/diagram.png -- --json

OPTIONS:
  --directory=<path>  Subdirectory to store images in
                      Example: lessons/mehrdimensionale-arrays
  --json              Output as JSON (for scripting)
  --help              Show this help

SUPPORTED FORMATS:
  - JPEG (.jpg, .jpeg)
  - PNG (.png)
  - GIF (.gif)
  - WebP (.webp)
  - SVG (.svg)

LIMITS:
  - Maximum file size: 10MB per image

RESPONSE:
  {
    "url": "https://cdn.ausbildung-in-der-it.de/...",
    "path": "lessons/arrays/abc123.png",
    "filename": "abc123.png",
    "original_filename": "diagram.png",
    "mime_type": "image/png",
    "size": 12345
  }

ENVIRONMENT VARIABLES:
  AIDI_API_TOKEN    Required - API authentication token
  AIDI_HOST_URL     Optional - API host URL (default: production)

USE CASES:
  - Upload generated educational visuals to AIDI CDN
  - Batch upload multiple images with glob patterns
  - Get CDN URLs for embedding in lesson blocks

WORKFLOW EXAMPLE:
  # 1. Generate educational visual
  npm run generate-image "Create sketchnotes explaining 2D arrays..." -- --aspect-ratio=16:9

  # 2. Upload to AIDI CDN
  npm run image:upload ./images/image-*.jpeg -- --directory=lessons/mehrdimensionale-arrays

  # 3. Use returned URL in lesson block (embed the CDN URL in your textBlock content)
  npm run blocks:update mehrdimensionale-arrays abc123 \\
    --data='{"content":"![2D Array](https://cdn.ausbildung-in-der-it.de/...)"}'

TECHNICAL NOTES:
  - Requires AIDI_API_TOKEN in .env
  - Uploads to AIDI platform storage via content-cli API
  - Returns public CDN URL for immediate use
  - Supports batch uploads with progress tracking
  - 60 second timeout per upload
`);
}

