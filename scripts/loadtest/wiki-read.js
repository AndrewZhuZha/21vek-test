import http from 'k6/http';
import { check, sleep } from 'k6';

const portalUrl = __ENV.PORTAL_URL || 'http://127.0.0.1:3000';
const sessionCookie = __ENV.WIKI_SESSION_COOKIE || '';
const vus = Number(__ENV.K6_VUS || 3000);
const duration = __ENV.K6_DURATION || '30s';

export const options = {
    scenarios: {
        wiki_read: {
            executor: 'constant-vus',
            vus: sessionCookie ? vus : 1,
            duration,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.1'],
        'http_req_duration{name:wiki_tree}': ['p(95)<2000'],
        'http_req_duration{name:wiki_page}': ['p(95)<2000'],
    },
};

const headers = {
    Accept: 'application/json',
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
};

export default function wikiReadScenario() {
    if (!sessionCookie) {
        console.warn('WIKI_SESSION_COOKIE not set — skipping authenticated wiki load test');
        sleep(1);
        return;
    }

    const treeResponse = http.get(`${portalUrl}/api/wiki/tree`, {
        tags: { name: 'wiki_tree' },
        headers,
    });

    check(treeResponse, {
        wiki_tree_ok: (r) => r.status === 200 || r.status === 304,
        wiki_tree_not_rate_limited: (r) => r.status !== 429,
    });

    const pageResponse = http.get(`${portalUrl}/api/wiki/page`, {
        tags: { name: 'wiki_page' },
        headers,
    });

    check(pageResponse, {
        wiki_page_ok: (r) => r.status === 200 || r.status === 304,
        wiki_page_not_rate_limited: (r) => r.status !== 429,
    });

    sleep(0.3);
}
