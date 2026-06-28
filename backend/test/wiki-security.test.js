import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWikiSlugInScope, isSlugInBaseScope, normalizeWikiSlug } from '../src/auth/wikiScope.js';
import { getWikiAssetCacheKey, getWikiCacheAuthSegment, getWikiPageCacheKey } from '../src/auth/wikiCacheKeys.js';
import { getWikiAssetCacheKeyForRequest } from '../src/auth/yandexWiki.js';

const BASE = 'homepage/team/docs';

test('normalizeWikiSlug strips hash wiki prefixes', () => {
    assert.equal(
        normalizeWikiSlug('wiki/#/homepage/team/docs/page'),
        'homepage/team/docs/page'
    );
});

test('isSlugInBaseScope accepts descendants only', () => {
    assert.equal(isSlugInBaseScope(`${BASE}/child`, BASE), true);
    assert.equal(isSlugInBaseScope('other/secret', BASE), false);
});

test('assertWikiSlugInScope throws 403 outside base', () => {
    assert.throws(
        () => assertWikiSlugInScope('other/secret', BASE),
        (error) => error.status === 403
    );
});

test('getWikiCacheAuthSegment differs for delegated tokens', () => {
    const a = getWikiCacheAuthSegment('token-a');
    const b = getWikiCacheAuthSegment('token-b');
    assert.notEqual(a, b);
    assert.match(a, /^[a-f0-9]{16}$/);
});

test('getWikiPageCacheKey includes auth segment', () => {
    const key = getWikiPageCacheKey(`${BASE}/page`, 'user-token', BASE);
    assert.match(key, /^page:v21:[a-f0-9]{16}:/);
});

test('getWikiAssetCacheKey includes auth segment', () => {
    const key = getWikiAssetCacheKey('files/path.png', 'user-token');
    assert.match(key, /^asset:v2:[a-f0-9]{16}:files\/path\.png$/);
});

test('getWikiAssetCacheKeyForRequest builds scoped cache key', () => {
    const key = getWikiAssetCacheKeyForRequest({
        file: 'diagram.png',
        src: 'manuals/vpn/diagram.png',
        slug: 'homepage/team/docs/page',
        accessToken: 'user-token'
    });
    assert.match(key, /^asset:v2:[a-f0-9]{16}:/);
});
