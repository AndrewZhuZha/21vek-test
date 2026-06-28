#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const baseUrl = (process.env.PORTAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const targets = (process.env.A11Y_URLS || `${baseUrl}/,${baseUrl}/wiki/`)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const chromeCandidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromePath) {
    const required = String(process.env.A11Y_REQUIRED || '').toLowerCase() === 'true';
    if (required) {
        console.error('verify:a11y failed: Chrome/Chromium binary not found and A11Y_REQUIRED=true.');
        process.exit(1);
    }
    console.warn('verify:a11y skipped: Chrome/Chromium binary not found. Set CHROME_BIN to run axe checks.');
    process.exit(0);
}

let failed = false;

for (const targetUrl of targets) {
    console.log(`\nA11y scan: ${targetUrl}`);
    const result = spawnSync(
        'npx',
        ['--yes', '--strict-ssl=false', '@axe-core/cli', targetUrl, '--chrome-path', chromePath],
        {
            stdio: 'inherit',
            shell: process.platform === 'win32'
        }
    );

    if (result.error) {
        console.error(result.error);
        failed = true;
        continue;
    }

    if ((result.status ?? 1) !== 0) {
        failed = true;
    }
}

process.exit(failed ? 1 : 0);
