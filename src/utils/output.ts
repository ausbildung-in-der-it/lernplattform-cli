/**
 * CLI Output Formatting Utilities
 * Provides colored output, tables, and pretty printing
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

let useColors = true;

export function disableColors(): void {
  useColors = false;
}

function color(text: string, colorCode: string): string {
  if (!useColors) return text;
  return `${colorCode}${text}${colors.reset}`;
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(color('✅ ' + message, colors.green));
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.error(color('❌ ' + message, colors.red));
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(color('⚠️  ' + message, colors.yellow));
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(color('ℹ️  ' + message, colors.cyan));
}

/**
 * Print header
 */
export function printHeader(text: string): void {
  console.log('\n' + color(text, colors.bright + colors.blue));
  console.log(color('='.repeat(text.length), colors.dim));
}

/**
 * Print section
 */
export function printSection(text: string): void {
  console.log('\n' + color(text, colors.bright));
}

/**
 * Print a simple table
 */
export function printTable(data: any[], columns: { key: string; label: string; width?: number }[]): void {
  if (data.length === 0) {
    printWarning('No data to display');
    return;
  }
  
  // Print header
  const headerRow = columns.map(col => 
    (col.label || col.key).padEnd(col.width || 20)
  ).join(' │ ');
  
  console.log(color(headerRow, colors.bright));
  console.log(color('─'.repeat(headerRow.length), colors.dim));
  
  // Print rows
  data.forEach((row, index) => {
    const rowStr = columns.map(col => {
      const value = row[col.key];
      const strValue = value === null || value === undefined ? '' : String(value);
      return strValue.padEnd(col.width || 20);
    }).join(' │ ');
    
    console.log(rowStr);
  });
}

/**
 * Print list with bullets
 */
export function printList(items: string[]): void {
  items.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item}`);
  });
}

/**
 * Print JSON (pretty formatted)
 */
export function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print key-value pairs
 */
export function printKeyValue(obj: Record<string, any>): void {
  const maxKeyLength = Math.max(...Object.keys(obj).map(k => k.length));
  
  Object.entries(obj).forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`  ${color(paddedKey, colors.dim)}: ${value}`);
  });
}

/**
 * Print pagination info
 */
export function printPagination(current: number, total: number, itemsOnPage: number, totalItems: number): void {
  console.log(color(`\nPage ${current}/${total} • Showing ${itemsOnPage} of ${totalItems} items`, colors.gray));
}

/**
 * Ask for confirmation
 */
export async function confirm(message: string, defaultYes: boolean = false): Promise<boolean> {
  const prompt = defaultYes ? `${message} [Y/n]` : `${message} [y/N]`;
  
  process.stdout.write(color(prompt + ' ', colors.yellow));
  
  return new Promise((resolve) => {
    process.stdin.once('data', (data) => {
      const input = data.toString().trim().toLowerCase();
      
      if (input === '') {
        resolve(defaultYes);
      } else if (input === 'y' || input === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

