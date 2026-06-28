import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const wikiIndexPath = path.join(rootDir, 'data', 'wiki-search.json');

function runNodeScript(scriptRelativePath) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [path.join(rootDir, scriptRelativePath)],
            {
                cwd: rootDir,
                stdio: 'inherit',
                env: process.env
            }
        );
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${scriptRelativePath} exited with code ${code}`));
        });
    });
}

async function validateWikiArtifacts() {
    const wikiEnabled = String(process.env.YANDEX_WIKI_ENABLED || 'false').toLowerCase() === 'true';
    if (!wikiEnabled) {
        return;
    }
    const minPagesRaw = Number(process.env.YANDEX_WIKI_MIN_PAGES || process.env.WIKI_INDEX_MIN_COUNT || '1');
    const minPages = Number.isFinite(minPagesRaw) && minPagesRaw > 0 ? Math.floor(minPagesRaw) : 1;

    const raw = await readFile(wikiIndexPath, 'utf8');
    const parsed = JSON.parse(raw);
    const count = Number.isFinite(Number(parsed?.count))
        ? Number(parsed.count)
        : (Array.isArray(parsed?.items) ? parsed.items.length : 0);
    if (count < minPages) {
        throw new Error(`Wiki artifact validation failed: pages=${count}, required>=${minPages}`);
    }
}

async function main() {
    await runNodeScript('scripts/sync-wiki-index.mjs');
    await runNodeScript('scripts/build-search-index.mjs');
    await validateWikiArtifacts();
    console.log('Wiki refresh complete: sync + build + validate.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
