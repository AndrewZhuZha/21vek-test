import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTreeItems, pageContentNeedsTreeMacro } from '../src/auth/wikiTree.js';

describe('wiki tree', () => {
    it('pageContentNeedsTreeMacro detects tree macro', () => {
        assert.equal(pageContentNeedsTreeMacro('{% tree %}'), true);
        assert.equal(pageContentNeedsTreeMacro('plain text'), false);
    });

    it('buildTreeItems nests pages under base slug', () => {
        const base = 'homepage/docs';
        const pages = [
            { id: 1, slug: 'homepage/docs', title: 'Root', parentId: null },
            { id: 2, slug: 'homepage/docs/child', title: 'Child', parentId: 1 }
        ];
        const items = buildTreeItems(base, pages);
        assert.equal(items.length, 1);
        assert.equal(items[0].slug, 'homepage/docs/child');
        assert.equal(items[0].depth, 0);
    });
});
