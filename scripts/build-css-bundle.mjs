import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const PORTAL_CSS = [
    'css/variables.css',
    'css/utilities.css',
    'css/background.css',
    'css/layout.css',
    'css/nav.css',
    'css/style.css',
    'css/cards.css',
    'css/themes.css',
    'css/scrollbars.css',
    'css/modal.css',
    'css/mobile.css',
    'css/tour.css',
    'css/auth.css'
];

const WIKI_CSS = [
    'css/variables.css',
    'css/utilities.css',
    'css/background.css',
    'css/layout.css',
    'css/nav.css',
    'css/style.css',
    'css/themes.css',
    'css/scrollbars.css',
    'css/mobile.css',
    'css/tour.css',
    'css/auth.css',
    'css/wiki/layout.css',
    'css/wiki/article.css',
    'css/wiki/lightbox.css'
];

async function concatCssFiles(relativePaths) {
    const chunks = [];
    for (const relativePath of relativePaths) {
        const absolutePath = path.join(rootDir, relativePath);
        const content = await readFile(absolutePath, 'utf8');
        chunks.push(`/* ${relativePath} */\n${content.trim()}\n`);
    }
    return `${chunks.join('\n')}\n`;
}

async function writeBundle(relativePaths, outputRelativePath) {
    const bundle = await concatCssFiles(relativePaths);
    const outputPath = path.join(rootDir, outputRelativePath);
    await writeFile(outputPath, bundle, 'utf8');
    console.log(`CSS bundle written: ${outputRelativePath} (${relativePaths.length} files)`);
    return stat(outputPath);
}

async function patchHtmlBundleUrls(version) {
    const htmlFiles = ['wiki.html', 'index.html'];
    for (const relativePath of htmlFiles) {
        const absolutePath = path.join(rootDir, relativePath);
        const source = await readFile(absolutePath, 'utf8');
        let patched = source.replace(
            /\/css\/(portal|wiki)\.bundle\.css(?:\?v=[^"'>\s]*)?/g,
            `/css/$1.bundle.css?v=${version}`
        );
        if (relativePath === 'wiki.html') {
            patched = patched.replace(
                /\/js\/wiki\/([a-zA-Z0-9_-]+\.js)(?:\?v=[^"'>\s]*)?/g,
                `/js/wiki/$1?v=${version}`
            );
            patched = patched.replace(
                /data-asset-version="[^"]*"/,
                `data-asset-version="${version}"`
            );
        }
        if (patched !== source) {
            await writeFile(absolutePath, patched, 'utf8');
            console.log(`Updated asset URLs in ${relativePath} (?v=${version})`);
        }
    }
}

async function main() {
    const [portalStat, wikiStat] = await Promise.all([
        writeBundle(PORTAL_CSS, 'css/portal.bundle.css'),
        writeBundle(WIKI_CSS, 'css/wiki.bundle.css')
    ]);
    const version = Math.max(portalStat.mtimeMs, wikiStat.mtimeMs).toString(36);
    await patchHtmlBundleUrls(version);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
