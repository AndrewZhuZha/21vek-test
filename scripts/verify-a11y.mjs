#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const targetUrl = process.env.A11Y_URL || 'http://localhost:3000/';

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
    process.exit(1);
}

process.exit(result.status ?? 1);
