import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const portalUrl = __ENV.PORTAL_URL || 'http://127.0.0.1:3000';
const vus = Number(__ENV.K6_VUS || 3000);
const duration = __ENV.K6_DURATION || '30s';

const staticLatency = new Trend('portal_static_latency', true);

export const options = {
    scenarios: {
        portal_static: {
            executor: 'constant-vus',
            vus,
            duration,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<500'],
        portal_static_latency: ['p(95)<500'],
    },
};

const staticPaths = [
    '/',
    '/css/portal.bundle.css',
    '/js/config.js',
    '/js/auth/index.js',
    '/js/app.js',
    '/js/search-index-loader.js',
    '/assets/favicon.svg',
];

export default function portalStaticScenario() {
    for (const path of staticPaths) {
        const response = http.get(`${portalUrl}${path}`, {
            tags: { name: path },
        });
        staticLatency.add(response.timings.duration);
        check(response, {
            'status is 200': (r) => r.status === 200,
        });
    }
    sleep(0.1);
}
