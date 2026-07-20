import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignored = new Set(['.git', 'node_modules']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const javascript = files.filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of javascript) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

for (const file of files.filter((path) => ['.json', '.webmanifest'].includes(extname(path)))) {
  JSON.parse(await readFile(file, 'utf8'));
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Doppelte HTML-IDs: ${[...new Set(duplicates)].join(', ')}`);

console.log(`Prüfung erfolgreich: ${javascript.length} JavaScript-Dateien, gültige JSON-Dateien und eindeutige HTML-IDs.`);
