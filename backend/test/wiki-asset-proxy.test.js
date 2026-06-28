import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWikiContentForTest } from '../src/auth/yandexWiki.js';

const PAGE_SLUG = 'homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/vpn/check-point';
const LEGACY_IMAGE_PATH = '/homepage/otdel-texnicheskogo-soprovozhdenija/manuals/vpn/check-point-vpn.-ustanovka-i-podkljuchenie-na-pk/.files/image-2.png';

test('wiki image proxy uses page slug for scope, keeps legacy src for download', async () => {
    const html = await renderWikiContentForTest(
        `<p>Step</p><img src="${LEGACY_IMAGE_PATH}" alt="screenshot">`,
        { pageId: 47667305, slug: PAGE_SLUG }
    );

    assert.match(html, /pageId=47667305/);
    assert.match(html, /file=image-2\.png/);
    assert.match(html, new RegExp(`slug=${encodeURIComponent(PAGE_SLUG).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(html, new RegExp(`src=${encodeURIComponent(LEGACY_IMAGE_PATH).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(html, /slug=homepage%2Fotdel-texnicheskogo-soprovozhdenija%2Fmanuals/);
});
