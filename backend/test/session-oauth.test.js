import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import {
    maybePurgeOAuthAccessTokenFromSession,
    shouldPersistOAuthAccessToken
} from '../src/auth/sessionOAuth.js';

describe('session OAuth token policy', () => {
    it('shouldPersistOAuthAccessToken returns boolean from current config', () => {
        const result = shouldPersistOAuthAccessToken();
        if (config.yandexWikiEnabled && !config.yandexWikiOAuthToken) {
            assert.equal(result, true);
            return;
        }
        if (config.yandex360UseDirectory) {
            assert.equal(result, true);
            return;
        }
        assert.equal(result, false);
    });

    it('maybePurgeOAuthAccessTokenFromSession removes token when service token configured', () => {
        if (!config.yandexWikiOAuthToken) {
            return;
        }
        const sessionData = {
            accessToken: 'user-oauth-token',
            user: { email: 'a@21vek.by', position: 'Engineer' }
        };
        maybePurgeOAuthAccessTokenFromSession(sessionData, sessionData.user);
        if (config.yandex360UseDirectory) {
            assert.equal(sessionData.accessToken, undefined);
        }
    });
});
