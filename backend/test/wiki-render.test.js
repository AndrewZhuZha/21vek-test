import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderWikiContentForTest } from '../src/auth/yandexWiki.js';

describe('wiki render', () => {
    it('renderWikiContentForTest converts legacy color markup', async () => {
        const html = await renderWikiContentForTest('{blue}(Синий текст)');
        assert.match(html, /wiki-color/);
        assert.doesNotMatch(html, /\{blue\}/);
    });

    it('renderWikiContentForTest renders keyboard markup', async () => {
        const html = await renderWikiContentForTest('Нажмите ++Win++');
        assert.match(html, /<kbd class="wiki-kbd">Win<\/kbd>/);
    });
});
