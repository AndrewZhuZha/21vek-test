import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireAuthOrGuestRequest } from '../middleware/requireAuth.js';
import { requireSameOrigin } from '../middleware/csrf.js';
import { trackerIpLimiter, trackerSessionLimiter } from '../middleware/rateLimit.js';
import {
    buildReporter,
    validateIssuePayload,
    validatePasswordResetPayload
} from '../tracker/validate.js';

export const trackerRouter = Router();

trackerRouter.post(
    '/issues',
    trackerIpLimiter,
    trackerSessionLimiter,
    requireAuthOrGuestRequest((req) => {
        if (!req.body || typeof req.body !== 'object') {
            return null;
        }
        return req.body.requestType;
    }),
    requireSameOrigin,
    (req, res) => {
        try {
            const validated = validateIssuePayload(req.body);
            const reporter = buildReporter(req.session?.user || null);
            const trackerPayload = {
                ...validated,
                ...reporter
            };

            if (config.trackerDemoMode) {
                const issueKey = `DEMO-${String(Date.now()).slice(-6)}`;
                console.log('Tracker issue (demo):', trackerPayload);
                res.json({
                    issueKey,
                    demo: true
                });
                return;
            }

            res.status(503).json({
                message: 'Tracker proxy не настроен для production. Включите TRACKER_DEMO_MODE или добавьте интеграцию с Tracker API.'
            });
        } catch (error) {
            res.status(400).json({ message: error instanceof Error ? error.message : 'Некорректный payload' });
        }
    }
);

trackerRouter.post(
    '/password-reset',
    trackerIpLimiter,
    trackerSessionLimiter,
    requireAuth,
    requireSameOrigin,
    (req, res) => {
        try {
            const validated = validatePasswordResetPayload(req.body);
            const reporter = buildReporter(req.session?.user || null);
            const trackerPayload = {
                ...validated,
                ...reporter
            };

            if (config.trackerDemoMode) {
                const issueKey = `DEMO-${String(Date.now()).slice(-6)}`;
                console.log('Tracker password reset (demo):', trackerPayload);
                res.json({
                    issueKey,
                    demo: true
                });
                return;
            }

            res.status(503).json({
                message: 'Password reset proxy не настроен для production. Добавьте интеграцию с Tracker API.'
            });
        } catch (error) {
            res.status(400).json({ message: error instanceof Error ? error.message : 'Некорректный payload' });
        }
    }
);
