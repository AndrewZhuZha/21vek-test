/**
 * Аудит всех страниц Wiki: ищет нераспарсенный синтаксис и проблемы с изображениями.
 *   node backend/scripts/wiki-audit.mjs [oauth_token] [--limit=N] [--no-assets]
 *
 * Без токена используйте GET /api/wiki/audit в браузере после входа в портал.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWikiAudit } from '../src/auth/wikiAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliArgs = process.argv.slice(2);
const limitArg = cliArgs.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;
const probeAssets = !cliArgs.includes('--no-assets');
const token = cliArgs.find((arg) => !arg.startsWith('--'))
    || process.env.YANDEX_WIKI_OAUTH_TOKEN
    || '';

if (!token) {
    console.error('Нужен OAuth token: argv[2] или YANDEX_WIKI_OAUTH_TOKEN в .env');
    console.error('Либо после входа в портал: fetch("/api/wiki/audit").then(r => r.json()).then(console.log)');
    process.exit(1);
}

console.log('Загрузка дерева Wiki...');
const result = await runWikiAudit(token, { limit, probeAssets });
console.log(`Страниц в дереве: ${result.total}, проверено: ${result.scanned}`);

const outPath = path.join(__dirname, '..', '..', 'tmp-wiki-audit.json');
writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
console.log('Отчёт:', outPath);
console.log('Страниц с проблемами:', result.report.length, '/', result.scanned);

if (result.report.length) {
    console.log('\nПримеры:');
    result.report.slice(0, 15).forEach((entry) => {
        console.log(`- ${entry.title} (${entry.slug})`);
        entry.issues.forEach((issue) => console.log(`    • ${issue}`));
    });
}

process.exit(result.report.length ? 1 : 0);
