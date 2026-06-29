import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    safeUnescapeWikiTags,
    sanitizeAndRewriteHtml
} from '../src/auth/wikiSanitize.js';

describe('wiki sanitize', () => {
    it('safeUnescapeWikiTags restores kbd without script', () => {
        const html = '&lt;kbd&gt;Win&lt;/kbd&gt;';
        const result = safeUnescapeWikiTags(html);
        assert.match(result, /<kbd>Win<\/kbd>/);
        assert.doesNotMatch(result, /script/i);
    });

    it('sanitizeAndRewriteHtml strips javascript href', () => {
        const html = '<a href="javascript:alert(1)">x</a><p>ok</p>';
        const result = sanitizeAndRewriteHtml(html);
        assert.doesNotMatch(result, /javascript:/);
        assert.match(result, /ok/);
    });

    it('sanitizeAndRewriteHtml rewrites wiki.yandex.ru links', () => {
        const html = '<a href="https://wiki.yandex.ru/homepage/docs/page">link</a>';
        const result = sanitizeAndRewriteHtml(html);
        assert.match(result, /href="\/wiki\/#\//);
    });
});
