import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWikiPageTitle } from '../src/auth/yandexWiki.js';
import { resolveWikiTreeMacros } from '../src/auth/wikiMarkup.js';
import { pickPageTitle, isLikelyFallbackTitle } from '../src/auth/wikiTitles.js';

test('pickPageTitle prefers Russian name over transliterated slug title', () => {
    const slug = 'homepage/vpn/vkljuchenie-sdl-windows-dlja-vxoda-v-active-direct';
    assert.equal(
        pickPageTitle({
            title: 'vkljuchenie sdl windows dlja vxoda v active direct',
            name: 'Включение SDL Windows для входа в Active Directory'
        }, slug),
        'Включение SDL Windows для входа в Active Directory'
    );
});

test('isLikelyFallbackTitle detects transliterated slug labels with partial tail match', () => {
    const slug = 'homepage/vpn/vkljuchenie-sdl-windows-dlja-vxoda-v-active-directory';
    assert.equal(
        isLikelyFallbackTitle('vkljuchenie sdl windows dlja vxoda v active direct', slug),
        true
    );
});

test('resolveWikiPageTitle extracts Russian heading from content when API title is transliterated slug', () => {
    const slug = 'homepage/instrukcii/kamery-smartpss/ustanovka-prilozhenija';
    const title = resolveWikiPageTitle(
        { slug, title: 'ustanovka prilozhenija' },
        '# Установка приложения\n\n1. Скачайте установщик...'
    );
    assert.equal(title, 'Установка приложения');
});

test('resolveWikiPageTitle keeps valid Russian API title', () => {
    const slug = 'homepage/instrukcii/kamery-smartpss/porjadok-vxoda';
    const title = resolveWikiPageTitle(
        { slug, title: 'Инструкция по входу в HikCentral' },
        '# Другой заголовок'
    );
    assert.equal(title, 'Инструкция по входу в HikCentral');
});

test('resolveWikiTreeMacros uses titlesBySlug for tree macro links', () => {
    const html = '{% tree depth="2" %}';
    const slug = 'homepage/instrukcii/kamery-smartpss';
    const childSlug = `${slug}/ustanovka-prilozhenija`;
    const rendered = resolveWikiTreeMacros(html, {
        slug,
        treeItems: [
            { slug: childSlug, title: 'ustanovka prilozhenija' }
        ],
        titlesBySlug: {
            [childSlug]: 'Установка приложения'
        }
    });
    assert.match(rendered, /Установка приложения/);
    assert.doesNotMatch(rendered, /ustanovka prilozhenija/i);
});
