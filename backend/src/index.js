import compression from 'compression';
import { randomUUID } from 'crypto';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { config, validateSecurityConfig } from './config.js';
import { setupSession } from './session.js';
import { authRouter } from './routes/auth.js';
import { trackerRouter } from './routes/tracker.js';

const app = express();

validateSecurityConfig();
await setupSession(app);
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://avatars.yandex.net'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'", 'https://oauth.yandex.ru']
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
    const requestId = sanitizeRequestId(req.headers['x-request-id']) || buildRequestId();
    const startedNs = process.hrtime.bigint();

    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
        if (!config.requestLogging) {
            return;
        }
        const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
        console.log(JSON.stringify({
            ts: nowIso(),
            level: 'info',
            event: 'http_request',
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Number(durationMs.toFixed(1))
        }));
    });

    next();
});

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: '21vek-it-portal' });
});

app.use('/api/auth', authRouter);
app.use('/api/tracker', trackerRouter);

const staticRoot = config.projectRoot;

/**
 * @param {string} urlPath
 * @returns {boolean}
 */
function isPortalRootPath(urlPath) {
    const normalized = String(urlPath || '/').replace(/\/+$/, '') || '/';
    return normalized === '/';
}

/**
 * @param {string} urlPath
 * @returns {boolean}
 */
function isStaticAssetRequest(urlPath) {
    const normalized = String(urlPath || '/');
    if (path.extname(normalized)) {
        return true;
    }
    return (
        normalized.startsWith('/assets/') ||
        normalized.startsWith('/css/') ||
        normalized.startsWith('/js/') ||
        normalized.startsWith('/data/') ||
        normalized.startsWith('/errors/')
    );
}

function buildRequestId() {
    if (typeof randomUUID === 'function') {
        return randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeRequestId(rawHeaderValue) {
    const firstValue = Array.isArray(rawHeaderValue)
        ? rawHeaderValue[0]
        : String(rawHeaderValue ?? '').split(',')[0];
    const normalized = String(firstValue || '').trim();
    if (!normalized) {
        return null;
    }
    return normalized.slice(0, 128);
}

function nowIso() {
    return new Date().toISOString();
}

app.use(express.static(staticRoot, {
    index: 'index.html',
    maxAge: 60 * 60 * 1000,
    setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
            return;
        }
        if (/\.(css|js|svg|png|jpg|jpeg|webp|gif|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        next();
        return;
    }
    if (path.extname(req.path)) {
        next();
        return;
    }
    if (!isPortalRootPath(req.path)) {
        next();
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(staticRoot, 'index.html'));
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        next();
        return;
    }
    if (!isStaticAssetRequest(req.path)) {
        next();
        return;
    }
    res.status(404).type('text/plain; charset=utf-8').send('Not found');
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ message: 'Not found' });
        return;
    }
    res.status(404).sendFile(path.join(staticRoot, 'errors', '404.html'));
});

app.use((error, req, res, next) => {
    const requestId = res.locals.requestId || null;
    console.error(JSON.stringify({
        ts: nowIso(),
        level: 'error',
        event: 'unhandled_server_error',
        requestId,
        method: req.method,
        path: req.path,
        message: error?.message || 'Unknown server error'
    }));
    if (res.headersSent) {
        next(error);
        return;
    }
    const parsedStatus = Number(error?.status || error?.statusCode);
    const status = Number.isInteger(parsedStatus) && parsedStatus >= 400 && parsedStatus < 600
        ? parsedStatus
        : 500;
    if (req.path.startsWith('/api/')) {
        const message = status >= 500 ? 'Internal server error' : (error?.message || 'Request failed');
        res.status(status).json({ message });
        return;
    }
    if (status === 404) {
        res.status(404).sendFile(path.join(staticRoot, 'errors', '404.html'));
        return;
    }
    res.status(500).sendFile(path.join(staticRoot, 'errors', '500.html'));
});

const server = app.listen(config.port, () => {
    console.log(`ИТ-портал: http://localhost:${config.port}`);
    console.log(`OAuth redirect_uri: ${config.redirectUri}`);
    if (!config.yandexClientId || !config.yandexClientSecret) {
        console.warn('YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET не заданы — вход через Яндекс недоступен. См. docs/AUTH-SETUP.md');
    }
});

let shutdownStarted = false;

function shutdown(signal) {
    if (shutdownStarted) {
        return;
    }
    shutdownStarted = true;
    console.log(JSON.stringify({
        ts: nowIso(),
        level: 'info',
        event: 'shutdown_started',
        signal
    }));

    const forceShutdownTimer = setTimeout(() => {
        console.error(JSON.stringify({
            ts: nowIso(),
            level: 'error',
            event: 'shutdown_forced_timeout',
            signal
        }));
        process.exit(1);
    }, 10000);
    forceShutdownTimer.unref();

    server.close((closeError) => {
        clearTimeout(forceShutdownTimer);
        if (closeError) {
            console.error(JSON.stringify({
                ts: nowIso(),
                level: 'error',
                event: 'shutdown_failed',
                signal,
                message: closeError.message
            }));
            process.exit(1);
            return;
        }
        console.log(JSON.stringify({
            ts: nowIso(),
            level: 'info',
            event: 'shutdown_completed',
            signal
        }));
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
