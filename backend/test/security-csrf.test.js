import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { requireSameOrigin } from '../src/middleware/csrf.js';

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

describe('CSRF same-origin guard', () => {
    it('allows POST with matching Origin', () => {
        let nextCalled = false;
        const req = {
            method: 'POST',
            get(name) {
                if (name === 'origin') return config.publicUrl;
                return undefined;
            }
        };
        const res = createMockRes();
        requireSameOrigin(req, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
    });

    it('blocks POST with foreign Origin', () => {
        let nextCalled = false;
        const req = {
            method: 'POST',
            get(name) {
                if (name === 'origin') return 'http://evil.example';
                return undefined;
            }
        };
        const res = createMockRes();
        requireSameOrigin(req, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
    });

    it('allows GET without Origin', () => {
        let nextCalled = false;
        const req = {
            method: 'GET',
            get() {
                return undefined;
            }
        };
        const res = createMockRes();
        requireSameOrigin(req, res, () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
    });
});
