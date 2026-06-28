/** Быстрая самопроверка парсера legacy Wiki markup. */
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeWikiAssetPath(rawPath) {
    return String(rawPath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\s+/g, '')
        .replace(/\/\.files\//gi, '/.files/')
        .replace(/\/files\//gi, '/.files/');
}

function legacyImageToTag(rawPath, altText = '') {
    const path = normalizeWikiAssetPath(String(rawPath || '').trim());
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const safeAlt = escapeHtml(String(altText || '').trim());
    return `\n\n<img src="${normalizedPath}" alt="${safeAlt}" loading="lazy" decoding="async">\n\n`;
}

function convertLegacyWikiImages(text) {
    return String(text || '').replace(
        /\(\s*(\/?[^)\s"]+?\/\.files\/[^)\s"]+?\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\s+"([^"]*)")?(?:\s*=\s*\d+x\d+)?\s*\)\s*!?/gi,
        (_, rawPath, altText) => legacyImageToTag(rawPath, altText)
    );
}

function looksLikeMarkdownContent(source) {
    return /^#{1,6}\s/m.test(source)
        || /\*\*[^*\n]+\*\*/.test(source)
        || /\(\s*\/?[^)\s"]+\/\.files\//i.test(source);
}

let failed = 0;

const withAlt = '(/homepage/foo/.files/image-4.png "Пример входа" =785x393) !';
const img = convertLegacyWikiImages(withAlt);
if (!img.includes('alt="Пример входа"') || !img.includes('image-4.png')) {
    console.error('FAIL: image with alt text');
    failed += 1;
} else {
    console.log('OK: image with alt text');
}

const spaced = convertLegacyWikiImages('(/homepage/foo/ files/image.png =100x100)');
if (!img.includes('.files/')) {
    console.error('FAIL: spaced path');
    failed += 1;
} else {
    console.log('OK: spaced path normalization');
}

const md = '### **Шаг 2. Вход**';
if (!looksLikeMarkdownContent(md)) {
    console.error('FAIL: markdown detection');
    failed += 1;
} else {
    console.log('OK: markdown detection');
}

process.exit(failed ? 1 : 0);
