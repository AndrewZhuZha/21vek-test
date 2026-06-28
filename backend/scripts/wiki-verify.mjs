/**
 * Полная проверка Wiki pipeline.
 *   node backend/scripts/wiki-verify.mjs [oauth_token] [slug]
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const token = process.argv[2] || process.env.YANDEX_WIKI_OAUTH_TOKEN || '';
const slug = process.argv[3]
    || 'homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/kamery-smartpss/porjadok-vxoda-v-uchjotnuju-zapis-hikcentral';

const {
    getWikiPagePayload,
    fetchWikiAssetBuffer,
    normalizeWikiSlug,
    renderWikiContentForTest
} = await import('../src/auth/yandexWiki.js');

const SAMPLE = `
### **Шаг 2. Вход в учётную запись**

Войдите в учётную запись Hikvision.

(/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/kamery-smartpss/porjadok-vxoda-v-uchjotnuju-zapis-hikcentral/.files/image-4.png "Пример входа" =785x393) !

##### **Если работаете через браузер(##\`http://172.16.209.100:81/#/\`##**)**..** ##### !
`;

const IP_SAMPLE = `
1. Нажмите ++WINDOWS + "R"++ и введите:

1. cmd

(/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/kompjuter/kak-uznat-ip-kompjutera/.files/image-2.png =800x600) !
`;

const IPCONFIG_OL = `<ol><li>Адаптер беспроводной локальной сети Беспроводная сеть:</li><li></li><li>DNS-суффикс подключения . . . . . : 21vek.local</li><li>Описание. . . . . . . . . . . . . : MediaTek Wi-Fi 6E</li><li>IPv4-адрес. . . . . . . . . . . . : 192.168.0.17</li><li>Маска подсети . . . . . . . . . . : 255.255.255.0</li><li>Основной шлюз. . . . . . . . . : 192.168.0.1</li></ol>`;

const COLOR_SAMPLE = `3. Во вкладке **Общие** в поле **Номер** указываем {blue}(внутренний номер) для вашего ПВЗ. Его можно взять {orange}(у куратора)`;

const TREE_SAMPLE = `{% tree %}`;

const KBD_LIST_SAMPLE = `1. Открыть ++Проводник++

2. Нажать ++Этот компьютер(правой кнопкой мыши) - Свойства++`;

const MOCK_TREE_ITEMS = [
    { slug: 'homepage/instrukcii/kamery-smartpss', title: 'Камеры (SmartPSS, HikCentral)' },
    { slug: 'homepage/instrukcii/kamery-smartpss/porjadok-vxoda', title: 'Порядок входа в HikCentral' },
    { slug: 'homepage/instrukcii/kamery-smartpss/nastrojka', title: 'Настройка камер' }
];

function analyzeHtml(html, label) {
    const issues = [];
    if (/\(\s*\/?[^)\s"]+\/\.files\//i.test(html)) issues.push('legacy image syntax visible');
    if (/^\s*#{1,6}\s/m.test(html)) issues.push('raw markdown headings visible');
    if (/<p>\s*!\s*<\/p>/i.test(html)) issues.push('orphan exclamation paragraph');
    if (/\byfm-anchor\b/i.test(html)) issues.push('yfm anchor duplicates visible');
    if (/>([^<]{4,})\1</i.test(html.replace(/\s+/g, ''))) issues.push('duplicated heading text');
    if (/\+\+[^+]+\+\+/i.test(html)) issues.push('raw keyboard markup visible');
    if (/&lt;kbd\b/i.test(html)) issues.push('escaped kbd visible');
    if (/\{[a-zA-Zа-яА-ЯёЁ]+\}\([^)]+\)/.test(html)) issues.push('raw color markup visible');
    if (/(?:\{%|\{\{)\s*-?\s*tree\b/i.test(html)) issues.push('raw tree macro visible');
    if (/<ol[^>]*>[\s\S]*?<li>[^<]*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i.test(html)) issues.push('ipconfig rendered as ordered list');
    if (!/\/api\/wiki\/asset/i.test(html)) issues.push('no proxied asset urls');
    console.log(`\n=== ${label} ===`);
    console.log('length:', html.length);
    console.log('figures:', (html.match(/wiki-figure/g) || []).length);
    console.log('asset urls:', (html.match(/\/api\/wiki\/asset/g) || []).length);
    if (issues.length) {
        console.log('ISSUES:', issues.join('; '));
        return false;
    }
    console.log('OK');
    return true;
}

let failed = 0;

function normalizeWikiDownloadUrlForTest(raw) {
    const WIKI_API_BASE = 'https://api.wiki.yandex.net/v1';
    const WIKI_WEB_BASE = 'https://wiki.yandex.ru';
    const url = String(raw || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) {
        if (/^\/v1\//i.test(url)) return `${WIKI_API_BASE}${url.slice(3)}`;
        if (/^\/pages\//i.test(url)) return `${WIKI_API_BASE}${url}`;
        return `${WIKI_WEB_BASE}${url}`;
    }
    return url;
}

const wikiPath = normalizeWikiDownloadUrlForTest('/homepage/foo/.files/image.png');
if (!wikiPath.startsWith('https://wiki.yandex.ru/')) {
    console.error('FAIL: wiki slug path must map to wiki.yandex.ru, got', wikiPath);
    failed += 1;
} else {
    console.log('OK: wiki slug download URL');
}

const sampleHtml = await renderWikiContentForTest(SAMPLE, {
    pageId: 12345,
    accessToken: token || undefined
});
const samplePath = path.join(__dirname, '..', '..', 'tmp-wiki-sample.html');
writeFileSync(samplePath, sampleHtml, 'utf8');
console.log('Saved sample render to', samplePath);
if (!analyzeHtml(sampleHtml, 'Sample markup')) failed += 1;

const ipHtml = await renderWikiContentForTest(IP_SAMPLE, { pageId: 999, accessToken: token || undefined });
if (!ipHtml.includes('<kbd')) {
    console.error('FAIL: keyboard markup not converted');
    failed += 1;
} else {
    console.log('OK: keyboard markup');
}
if (!ipHtml.includes('wiki-console') && !ipHtml.includes('<pre>cmd</pre>')) {
    console.error('FAIL: cmd block not converted to pre');
    failed += 1;
} else {
    console.log('OK: cmd pre block');
}
if (!ipHtml.includes('image-2.png')) {
    console.error('FAIL: image filename missing in proxy url');
    failed += 1;
} else {
    console.log('OK: image filename in proxy');
}

const ipconfigHtml = await renderWikiContentForTest(IPCONFIG_OL, { pageId: 999 });
if (!ipconfigHtml.includes('wiki-console')) {
    console.error('FAIL: ipconfig list not consolidated to pre');
    failed += 1;
} else {
    console.log('OK: ipconfig console block');
}

const colorHtml = await renderWikiContentForTest(COLOR_SAMPLE, { pageId: 999 });
if (!colorHtml.includes('wiki-color--blue') || !colorHtml.includes('wiki-color--orange')) {
    console.error('FAIL: legacy color markup not converted');
    failed += 1;
} else {
    console.log('OK: legacy color markup');
}
if (/\{blue\}/i.test(colorHtml)) {
    console.error('FAIL: raw {blue} still visible');
    failed += 1;
}

const treeHtml = await renderWikiContentForTest(TREE_SAMPLE, {
    pageId: 999,
    slug: 'homepage/instrukcii/kamery-smartpss',
    treeItems: MOCK_TREE_ITEMS
});
if (!treeHtml.includes('wiki-tree-macro')) {
    console.error('FAIL: tree macro not rendered');
    failed += 1;
} else {
    console.log('OK: tree macro');
}
if (/(?:\{%|\{\{)\s*-?\s*tree\b/i.test(treeHtml)) {
    console.error('FAIL: raw tree macro still visible');
    failed += 1;
}

const kbdListHtml = await renderWikiContentForTest(KBD_LIST_SAMPLE, { pageId: 999 });
if (!kbdListHtml.includes('<kbd class="wiki-kbd">')) {
    console.error('FAIL: kbd not rendered in numbered list');
    failed += 1;
} else {
    console.log('OK: kbd in numbered list');
}
if (/&lt;kbd\b/i.test(kbdListHtml)) {
    console.error('FAIL: escaped kbd visible in numbered list');
    failed += 1;
}
if (/<li>[^<]*&lt;kbd/i.test(kbdListHtml)) {
    console.error('FAIL: kbd escaped inside list item');
    failed += 1;
}

if (!token) {
    console.warn('No OAuth token — skipping live API checks. Pass token as argv[2] or set YANDEX_WIKI_OAUTH_TOKEN.');
} else {
    try {
        console.log('Fetching page:', slug);
        const page = await getWikiPagePayload(normalizeWikiSlug(slug), token);
        const outPath = path.join(__dirname, '..', '..', 'tmp-wiki-page.html');
        writeFileSync(outPath, page.html || '', 'utf8');
        console.log('Saved HTML to', outPath);
        console.log('page id:', page.id, 'title:', page.title);
        if (!analyzeHtml(page.html || '', 'Live page')) failed += 1;

        const assetMatch = String(page.html || '').match(/\/api\/wiki\/asset[^"']+/);
        if (assetMatch) {
            const url = new URL(assetMatch[0], 'http://local');
            const pageId = Number(url.searchParams.get('pageId'));
            const file = url.searchParams.get('file') || '';
            const sourceSlug = url.searchParams.get('slug') || '';
            const attachmentId = Number(url.searchParams.get('attachmentId'));
            console.log('\nTesting asset:', file);
            const asset = await fetchWikiAssetBuffer(
                pageId,
                file,
                token,
                '',
                sourceSlug,
                Number.isFinite(attachmentId) ? attachmentId : 0
            );
            console.log('Asset OK:', asset.fileName, asset.contentType, asset.buffer.length, 'bytes');
        } else {
            console.log('No asset URL found in HTML');
            failed += 1;
        }
    } catch (error) {
        console.error('Live API failed:', error.message);
        failed += 1;
    }
}

process.exit(failed ? 1 : 0);
