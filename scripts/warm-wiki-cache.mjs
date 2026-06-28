#!/usr/bin/env node
/**
 * Прогрев Wiki-кэша после деплоя или по cron (внутренний вызов backend, без HTTP-сессии).
 * Требует YANDEX_WIKI_OAUTH_TOKEN для общего кэша svc.
 *
 * Запуск:
 *   node scripts/warm-wiki-cache.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { config } from '../backend/src/config.js';
import { getWikiPagePayload, getWikiTreePayload } from '../backend/src/auth/yandexWiki.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });

const maxPages = Number(process.env.WIKI_WARM_MAX_PAGES || 50);
const wikiSearchPath = path.join(projectRoot, 'data', 'wiki-search.json');

/**
 * @returns {Promise<string[]>}
 */
async function loadWarmSlugs() {
    try {
        const raw = await readFile(wikiSearchPath, 'utf8');
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        const slugs = items
            .map((item) => String(item?.slug || '').trim())
            .filter(Boolean);
        return [...new Set(slugs)].slice(0, maxPages);
    } catch {
        return [];
    }
}

async function main() {
    if (!config.yandexWikiEnabled) {
        console.log('YANDEX_WIKI_ENABLED=false — warmup пропущен.');
        process.exit(0);
    }

    const serviceToken = String(config.yandexWikiOAuthToken || '').trim();
    if (!serviceToken) {
        console.error('YANDEX_WIKI_OAUTH_TOKEN обязателен для прогрева общего Wiki-кэша.');
        process.exit(1);
    }

    console.log('Wiki cache warmup (internal)...');

    await getWikiTreePayload(serviceToken);
    console.log('tree: ok');

    const slugs = await loadWarmSlugs();
    if (slugs.length === 0 && config.yandexWikiBaseSlug) {
        slugs.push(config.yandexWikiBaseSlug);
    }

    let warmed = 0;
    for (const slug of slugs) {
        try {
            await getWikiPagePayload(slug, serviceToken);
            warmed += 1;
            console.log(`page ${slug}: ok`);
        } catch (error) {
            console.warn(
                `page ${slug}: failed`,
                error instanceof Error ? error.message : error
            );
        }
    }

    console.log(`Wiki warmup finished. pages=${warmed}/${slugs.length}`);
    process.exit(0);
}

main().catch((error) => {
    console.error('Wiki warmup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
});
