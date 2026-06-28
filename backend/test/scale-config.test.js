import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('config scale mode', () => {
    it('rejects memory sessions when RATE_LIMIT_SCALE_MODE=true in production', async () => {
        const previousEnv = { ...process.env };
        try {
            process.env.NODE_ENV = 'production';
            process.env.SESSION_STORE = 'memory';
            process.env.SESSION_SECRET = 'x'.repeat(40);
            process.env.PUBLIC_URL = 'https://portal.example.com';
            process.env.RATE_LIMIT_SCALE_MODE = 'true';
            process.env.TRACKER_DEMO_MODE = 'true';
            process.env.YANDEX_WIKI_ENABLED = 'false';
            process.env.YANDEX_OAUTH_TLS_INSECURE = 'false';

            const { validateSecurityConfig } = await import(`../src/config.js?scale-test=${Date.now()}`);

            assert.throws(
                () => validateSecurityConfig(),
                /RATE_LIMIT_SCALE_MODE=true требует SESSION_STORE=redis/
            );
        } finally {
            process.env = previousEnv;
        }
    });
});
