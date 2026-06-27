import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { config } from './config.js';
import { setupSession } from './session.js';
import { authRouter } from './routes/auth.js';
import { trackerRouter } from './routes/tracker.js';

const app = express();

setupSession(app);
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

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: '21vek-it-portal' });
});

app.use('/api/auth', authRouter);
app.use('/api/tracker', trackerRouter);

const staticRoot = config.projectRoot;
app.use(express.static(staticRoot, { index: 'index.html' }));

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        next();
        return;
    }
    if (path.extname(req.path)) {
        next();
        return;
    }
    res.sendFile(path.join(staticRoot, 'index.html'));
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ message: 'Not found' });
        return;
    }
    res.status(404).sendFile(path.join(staticRoot, 'errors', '404.html'));
});

app.listen(config.port, () => {
    console.log(`ИТ-портал: http://localhost:${config.port}`);
    console.log(`OAuth redirect_uri: ${config.redirectUri}`);
    if (!config.yandexClientId || !config.yandexClientSecret) {
        console.warn('YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET не заданы — вход через Яндекс недоступен. См. docs/AUTH-SETUP.md');
    }
});
