/**
 * fontLoader — resolves Liberation Sans TTF files from well-known system paths.
 *
 * Liberation Sans is metric-compatible with Helvetica/Arial and must be
 * installed on the host for PDF/A-3b font-embedding compliance.
 *
 * Docker/Alpine:  apk add font-liberation
 *   → /usr/share/fonts/liberation/LiberationSans-Regular.ttf
 *
 * Debian/Ubuntu:  apt-get install fonts-liberation
 *   → /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
 *
 * Local fallback: place TTF files in src/server/assets/fonts/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEARCH_DIRS = [
  // Alpine — font-liberation package
  '/usr/share/fonts/liberation',
  // Debian/Ubuntu — fonts-liberation package
  '/usr/share/fonts/truetype/liberation',
  // Some Alpine / Arch variants
  '/usr/share/fonts/TTF',
  // Local project asset fallback (src/server/assets/fonts/)
  path.resolve(__dirname, 'fonts'),
];

function tryLoad(filename: string): Uint8Array | null {
  for (const dir of SEARCH_DIRS) {
    const fullPath = path.join(dir, filename);
    try {
      return new Uint8Array(fs.readFileSync(fullPath));
    } catch {
      // not found in this directory, try next
    }
  }
  return null;
}

export function loadLiberationSansRegular(): Uint8Array | null {
  return tryLoad('LiberationSans-Regular.ttf');
}

export function loadLiberationSansBold(): Uint8Array | null {
  return tryLoad('LiberationSans-Bold.ttf');
}
