import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('production security config', () => {
    it('requires YANDEX_WIKI_OAUTH_TOKEN when wiki enabled in production', async () => {
        const previousEnv = { ...process.env };
        try {
            process.env.NODE_ENV = 'production';
            process.env.SESSION_STORE = 'redis';
            process.env.SESSION_REDIS_URL = 'redis://127.0.0.1:6379';
            process.env.SESSION_SECRET = 'x'.repeat(40);
            process.env.PUBLIC_URL = 'https://portal.example.com';
            process.env.TRACKER_DEMO_MODE = 'true';
            process.env.YANDEX_WIKI_ENABLED = 'true';
            process.env.YANDEX_WIKI_OAUTH_TOKEN = '';
            process.env.YANDEX_WIKI_ORG_ID = '123';
            process.env.YANDEX_WIKI_BASE_SLUG = 'homepage/docs';
            process.env.YANDEX_OAUTH_TLS_INSECURE = 'false';

            const { validateSecurityConfig } = await import(`../src/config.js?sec-test=${Date.now()}`);

            assert.throws(
                () => validateSecurityConfig(),
                /YANDEX_WIKI_OAUTH_TOKEN/
            );
        } finally {
            process.env = previousEnv;
        }
    });
});
