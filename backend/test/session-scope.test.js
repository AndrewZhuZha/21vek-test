import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { needsSession } from '../src/session.js';

describe('session scope', () => {
    it('needsSession is true only for /api routes', () => {
        assert.equal(needsSession({ path: '/css/portal.bundle.css' }), false);
        assert.equal(needsSession({ path: '/js/config.js' }), false);
        assert.equal(needsSession({ path: '/' }), false);
        assert.equal(needsSession({ path: '/wiki/' }), false);
        assert.equal(needsSession({ path: '/api/health' }), true);
        assert.equal(needsSession({ path: '/api/auth/me' }), true);
    });
});
