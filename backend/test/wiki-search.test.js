import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, tokenizeSlug } from '../src/auth/wikiSearch.js';

describe('wiki search helpers', () => {
    it('normalizeSearchText lowercases and normalizes yo', () => {
        assert.equal(normalizeSearchText('  Ёлка  '), 'елка');
    });

    it('tokenizeSlug expands slug segments', () => {
        const text = tokenizeSlug('homepage/docs/page-one');
        assert.match(text, /page one/i);
    });
});
