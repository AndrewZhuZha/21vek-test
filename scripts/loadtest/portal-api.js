import http from 'k6/http';
import { check, sleep } from 'k6';

const portalUrl = __ENV.PORTAL_URL || 'http://127.0.0.1:3000';
const vus = Number(__ENV.K6_VUS || 3000);
const duration = __ENV.K6_DURATION || '30s';

export const options = {
    scenarios: {
        portal_api: {
            executor: 'constant-vus',
            vus,
            duration,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<1000'],
        'http_req_duration{name:auth_me}': ['p(95)<1000'],
        'checks{rate_limit_ok}': ['rate>0.99'],
    },
};

export default function portalApiScenario() {
    const meResponse = http.get(`${portalUrl}/api/auth/me`, {
        tags: { name: 'auth_me' },
        headers: { Accept: 'application/json' },
    });

    check(meResponse, {
        rate_limit_ok: (r) => r.status !== 429,
        auth_or_unauthorized: (r) => r.status === 401 || r.status === 200,
    });

    const configResponse = http.get(`${portalUrl}/api/auth/config-check`, {
        tags: { name: 'auth_config_check' },
        headers: { Accept: 'application/json' },
    });

    check(configResponse, {
        config_ok: (r) => r.status === 200,
        config_not_rate_limited: (r) => r.status !== 429,
    });

    sleep(0.2);
}
