/**
 * Save Utility - Save JSON responses to backup files
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export type BackupType = 'lesson' | 'module' | 'path' | 'practice';

/**
 * Saves JSON data to a backup file with timestamp
 * Returns the file path where data was saved
 */
export function saveToFile(
  type: BackupType,
  slug: string,
  data: any
): string {
  // Generate timestamp for filename
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  
  // Map type to directory name
  const typeMap: Record<BackupType, string> = {
    lesson: 'lessons',
    module: 'modules',
    path: 'learning-paths',
    practice: 'practice-tasks',
  };
  
  // Construct paths
  const dir = join('backups', typeMap[type]);
  const filename = `${type}_${slug}_${timestamp}.json`;
  const filepath = join(dir, filename);
  
  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  // Save file
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  
  return filepath;
}

