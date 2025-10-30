import fs from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const __root = path.resolve(__dirname, '..', '..');

if (!fs.existsSync(path.resolve(__root, 'package.json'))) {
  throw new Error(
    `fromRoot helper misconfigured: expected package.json at ${path.resolve(__root, 'package.json')}`
  );
}

export function fromRoot(pathname: string) {
  return path.resolve(__root, pathname);
}
