import * as fs from 'fs';

/**
 * CLI Argument Parser
 * Parses command line arguments into positional args and flags
 */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, any>;
}

/**
 * Parses command line arguments
 * Supports: --key=value, --key value, --flag (boolean), positional args
 */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, any> = {};
  
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    
    // Flag with = (--key=value)
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=');
      flags[key] = parseValue(value);
      i++;
    }
    // Flag with next arg (--key value)
    else if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      const key = arg.slice(2);
      flags[key] = parseValue(argv[i + 1]);
      i += 2;
    }
    // Boolean flag (--flag)
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      flags[key] = true;
      i++;
    }
    // Short flag (-f)
    else if (arg.startsWith('-') && arg.length === 2) {
      flags[arg.slice(1)] = true;
      i++;
    }
    // Positional argument
    else {
      positional.push(arg);
      i++;
    }
  }
  
  return { positional, flags };
}

/**
 * Parses a value string into appropriate type
 */
function parseValue(value: string): any {
  // Try to parse as JSON first (for objects/arrays)
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  
  // Parse numbers
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  
  // Parse booleans
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  // Return as string
  return value;
}

/**
 * Gets a required positional argument or throws error
 */
export function getRequiredArg(args: ParsedArgs, index: number, name: string): string {
  const value = args.positional[index];
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

/**
 * Gets an optional positional argument
 */
export function getOptionalArg(args: ParsedArgs, index: number, defaultValue?: string): string | undefined {
  return args.positional[index] || defaultValue;
}

/**
 * Gets a required flag or throws error
 */
export function getRequiredFlag(args: ParsedArgs, key: string): any {
  const value = args.flags[key];
  if (value === undefined) {
    throw new Error(`Missing required flag: --${key}`);
  }
  return value;
}

/**
 * Gets an optional flag with default value
 */
export function getOptionalFlag(args: ParsedArgs, key: string, defaultValue?: any): any {
  return args.flags[key] ?? defaultValue;
}

// ============================================================================
// JSON Input Methods - Base64 and Stdin Support
// ============================================================================

/**
 * Decodes a Base64 string and parses it as JSON
 * @param base64 - Base64 encoded JSON string
 * @returns Parsed JSON object
 */
export function decodeBase64Json(base64: string): any {
  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in Base64 data: ${error.message}`);
    }
    throw new Error(`Failed to decode Base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reads JSON from stdin synchronously
 * Use with heredoc: npm run cmd -- --data-stdin <<'EOF' ... EOF
 * Or pipe: cat file.json | npm run cmd -- --data-stdin
 * @returns Parsed JSON object
 */
export function readJsonFromStdin(): any {
  try {
    // Read from stdin (file descriptor 0)
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) {
      throw new Error('No input received from stdin');
    }
    return JSON.parse(input);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON from stdin: ${error.message}`);
    }
    throw new Error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reads raw text from stdin synchronously (for non-JSON content like markdown)
 * @returns Raw text string
 */
export function readTextFromStdin(): string {
  try {
    const input = fs.readFileSync(0, 'utf-8');
    if (!input) {
      throw new Error('No input received from stdin');
    }
    return input;
  } catch (error) {
    throw new Error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decodes a Base64 string to plain text (for non-JSON content)
 * @param base64 - Base64 encoded string
 * @returns Decoded text
 */
export function decodeBase64Text(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    throw new Error(`Failed to decode Base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets JSON data from multiple possible sources with priority:
 * 1. Stdin (--flagName-stdin)
 * 2. Base64 (--flagName-base64)
 * 3. Normal flag (--flagName)
 *
 * @param args - Parsed CLI arguments
 * @param flagName - Base name of the flag (e.g., 'data', 'blocks', 'items')
 * @returns Parsed JSON object or undefined if no flag is set
 *
 * @example
 * // Usage in CLI:
 * const data = getJsonData(args, 'data');
 *
 * // Supports:
 * // --data='{"title":"..."}'
 * // --data-base64="eyJ0aXRsZSI6Ii4uLiJ9"
 * // --data-stdin (with heredoc or pipe)
 */
export function getJsonData(args: ParsedArgs, flagName: string): any | undefined {
  // Priority 1: Stdin
  if (args.flags[`${flagName}-stdin`]) {
    return readJsonFromStdin();
  }

  // Priority 2: Base64
  const base64Value = args.flags[`${flagName}-base64`];
  if (base64Value) {
    return decodeBase64Json(base64Value);
  }

  // Priority 3: Normal flag
  const normalValue = args.flags[flagName];
  if (normalValue !== undefined) {
    // Already parsed by parseValue() if it looks like JSON
    if (typeof normalValue === 'object') {
      return normalValue;
    }
    // Try to parse as JSON if it's a string
    if (typeof normalValue === 'string') {
      try {
        return JSON.parse(normalValue);
      } catch {
        // Return as-is if not valid JSON
        return normalValue;
      }
    }
    return normalValue;
  }

  return undefined;
}

/**
 * Gets text data from multiple possible sources with priority:
 * 1. Stdin (--flagName-stdin)
 * 2. Base64 (--flagName-base64)
 * 3. Normal flag (--flagName)
 *
 * Use this for non-JSON text content like markdown.
 *
 * @param args - Parsed CLI arguments
 * @param flagName - Base name of the flag (e.g., 'content', 'task-markdown')
 * @returns Text string or undefined if no flag is set
 */
export function getTextData(args: ParsedArgs, flagName: string): string | undefined {
  // Priority 1: Stdin
  if (args.flags[`${flagName}-stdin`]) {
    return readTextFromStdin();
  }

  // Priority 2: Base64
  const base64Value = args.flags[`${flagName}-base64`];
  if (base64Value) {
    return decodeBase64Text(base64Value);
  }

  // Priority 3: Normal flag
  const normalValue = args.flags[flagName];
  if (normalValue !== undefined) {
    return String(normalValue);
  }

  return undefined;
}

