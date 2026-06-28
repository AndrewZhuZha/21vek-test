/** UI wiki reader: дерево, поиск, загрузка страницы, ссылка на оригинал. */
(function () {
    const api = window.PortalWikiApi;
    if (!api) return;

    const treeRoot = document.getElementById('wikiTree');
    const treeStatus = document.getElementById('wikiSidebarStatus');
    const searchField = document.getElementById('wikiSearchField');
    const searchInput = document.getElementById('wikiSearchInput');
    const clearSearchBtn = document.getElementById('wikiSearchClearBtn');
    const searchSpinner = document.getElementById('wikiSearchSpinner');
    const pageTitleEl = document.getElementById('wikiPageTitle');
    const pageMetaEl = document.getElementById('wikiPageMeta');
    const pageContentEl = document.getElementById('wikiPageContent');
    const noticeEl = document.getElementById('wikiPageNotice');
    const openLinkEl = document.getElementById('wikiOpenLink');
    const breadcrumbsEl = document.getElementById('wikiBreadcrumbs');
    const treeLoadingEl = document.getElementById('wikiTreeLoading');
    const pageLoadingEl = document.getElementById('wikiPageLoading');
    const articleShellEl = document.getElementById('wikiArticleShell');
    const sidebarToggleEl = document.getElementById('wikiSidebarToggle');
    const sidebarPanelEl = document.getElementById('wikiSidebarPanel');
    const sidebarBackdropEl = document.getElementById('wikiSidebarBackdrop');

    if (!treeRoot || !pageContentEl || !pageTitleEl || !pageMetaEl) {
        return;
    }

    const state = {
        config: null,
        baseSlug: '',
        treeItems: [],
        activeSlug: '',
        searchRequestId: 0,
        pageRequestId: 0,
        collapsedSlugs: new Set(),
        isSearchMode: false,
        baseSlugTitle: '',
        slugTitles: new Map()
    };
    let searchDebounceTimer = null;
    let searchAbortController = null;

    function normalizeSlug(value) {
        let slug = String(value || '').trim();
        if (slug.includes('%')) {
            try {
                slug = decodeURIComponent(slug);
            } catch {
                // keep raw
            }
        }
        return slug
            .replace(/^\/+/, '')
            .replace(/^(?:wiki\/#\/?|wiki\/|#\/?)/i, '')
            .replace(/\/+$/, '');
    }

    function splitSlug(value) {
        return normalizeSlug(value)
            .split('/')
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function encodeHashSlug(slug) {
        return splitSlug(slug)
            .map((part) => encodeURIComponent(part))
            .join('/');
    }

    function decodeHashSlug(rawHash) {
        const cleaned = String(rawHash || '')
            .replace(/^#\/?/, '')
            .replace(/\?.*$/, '')
            .replace(/\/+$/, '');
        if (!cleaned) return '';
        const decoded = cleaned
            .split('/')
            .map((part) => {
                try {
                    return decodeURIComponent(part);
                } catch {
                    return part;
                }
            })
            .join('/');
        return normalizeSlug(decoded);
    }

    function safeDecodeURIComponent(value) {
        try {
            return decodeURIComponent(String(value || ''));
        } catch {
            return String(value || '');
        }
    }

    function getSlugFromLocation() {
        return decodeHashSlug(window.location.hash);
    }

    function setLocationSlug(slug) {
        const normalized = normalizeSlug(slug);
        if (!normalized) return;
        const nextHash = `#/${encodeHashSlug(normalized)}`;
        if (window.location.hash !== nextHash) {
            window.location.hash = nextHash;
        }
    }

    function slugDepth(slug) {
        return splitSlug(slug).length;
    }

    function setSidebarStatus(text) {
        if (treeStatus) {
            treeStatus.textContent = text;
        }
    }

    function hideNotice() {
        if (!noticeEl) return;
        noticeEl.classList.add('hidden');
        noticeEl.textContent = '';
    }

    function showNotice(message) {
        if (!noticeEl) return;
        noticeEl.classList.remove('hidden');
        noticeEl.textContent = message;
    }

    function formatUpdatedAt(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const formatted = date.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return formatted.replace(',', '');
    }

    function rebuildSlugTitleMap(titlesBySlug) {
        const map = new Map();
        const source = titlesBySlug && typeof titlesBySlug === 'object' ? titlesBySlug : {};
        Object.entries(source).forEach(([slug, title]) => {
            const normalized = normalizeSlug(slug);
            const label = String(title || '').trim();
            if (normalized && label) {
                map.set(normalized, label);
            }
        });
        const baseSlug = normalizeSlug(state.baseSlug);
        if (baseSlug && state.baseSlugTitle) {
            map.set(baseSlug, state.baseSlugTitle);
        }
        state.treeItems.forEach((entry) => {
            const slug = normalizeSlug(entry?.slug);
            const title = String(entry?.title || '').trim();
            if (!slug || !title) {
                return;
            }
            const existing = map.get(slug);
            if (existing && !isLatinSlugTitle(existing, slug)) {
                return;
            }
            if (!isLatinSlugTitle(title, slug) || !existing) {
                map.set(slug, title);
            }
        });
        state.slugTitles = map;
    }

    function isLatinSlugTitle(title, slug) {
        const label = String(title || '').trim();
        if (!label || /[а-яё]/i.test(label)) {
            return false;
        }
        const tail = (splitSlug(slug).pop() || '').replace(/[-_]+/g, ' ').toLowerCase();
        return label.toLowerCase() === tail || (!/[а-яё]/i.test(label) && /[a-z]/i.test(label));
    }

    function titleForSlug(slug) {
        const normalized = normalizeSlug(slug);
        const baseSlug = normalizeSlug(state.baseSlug);
        const configuredBaseTitle = String(
            state.baseSlugTitle
            || state.config?.baseTitle
            || window.PortalConfig?.wiki?.baseTitle
            || ''
        ).trim();
        if (normalized === baseSlug && configuredBaseTitle) {
            return configuredBaseTitle;
        }
        const cached = state.slugTitles.get(normalized);
        if (cached && !isLatinSlugTitle(cached, normalized)) {
            return cached;
        }
        if (cached) {
            return cached;
        }
        const item = state.treeItems.find((entry) => normalizeSlug(entry.slug) === normalized);
        if (item?.title && !isLatinSlugTitle(item.title, normalized)) {
            return String(item.title);
        }
        if (item?.title) {
            return String(item.title);
        }
        const tail = splitSlug(normalized).pop() || normalized;
        return tail.replace(/[-_]+/g, ' ');
    }

    function setTreeLoading(isLoading) {
        if (treeLoadingEl) {
            treeLoadingEl.classList.toggle('hidden', !isLoading);
            treeLoadingEl.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
        }
        if (treeRoot) {
            treeRoot.classList.toggle('wiki-tree--loading', isLoading);
        }
    }

    function setPageLoading(isLoading) {
        if (pageLoadingEl) {
            pageLoadingEl.classList.toggle('hidden', !isLoading);
            pageLoadingEl.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
        }
        if (articleShellEl) {
            articleShellEl.classList.toggle('wiki-article-shell--loading', isLoading);
        }
        if (pageContentEl) {
            pageContentEl.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        }
    }

    function renderBreadcrumbs(slug) {
        if (!breadcrumbsEl) {
            return;
        }
        const normalized = normalizeSlug(slug || state.baseSlug);
        const parts = splitSlug(normalized);
        const baseParts = splitSlug(state.baseSlug);
        if (!parts.length) {
            breadcrumbsEl.innerHTML = '';
            return;
        }

        const crumbs = [];
        let acc = '';
        parts.forEach((part, index) => {
            acc = acc ? `${acc}/${part}` : part;
            const isLast = index === parts.length - 1;
            const skip = index < baseParts.length - 1 && baseParts.length > 1;
            if (skip && index < baseParts.length - 1) {
                return;
            }
            const label = titleForSlug(acc);
            if (isLast) {
                crumbs.push(`<span class="wiki-breadcrumbs__current">${escapeHtml(label)}</span>`);
            } else {
                crumbs.push(`<a class="wiki-breadcrumbs__item" href="/wiki/#/${encodeHashSlug(acc)}">${escapeHtml(label)}</a>`);
            }
        });

        breadcrumbsEl.innerHTML = crumbs.join('<span class="wiki-breadcrumbs__sep">/</span>');
    }

    function setInitialHash(slug) {
        const normalized = normalizeSlug(slug);
        if (!normalized) {
            return;
        }
        const nextHash = `#/${encodeHashSlug(normalized)}`;
        if (window.location.hash !== nextHash) {
            history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
        }
    }

    function readFigureAspectRatio(img) {
        const naturalWidth = Number(img.naturalWidth);
        const naturalHeight = Number(img.naturalHeight);
        if (naturalWidth > 0 && naturalHeight > 0) {
            return `${naturalWidth} / ${naturalHeight}`;
        }
        const attrWidth = Number(img.getAttribute('width'));
        const attrHeight = Number(img.getAttribute('height'));
        if (attrWidth > 0 && attrHeight > 0) {
            return `${attrWidth} / ${attrHeight}`;
        }
        return '';
    }

    function primeFigurePlaceholder(figure, img) {
        const ratio = readFigureAspectRatio(img);
        if (ratio) {
            figure.style.aspectRatio = ratio;
            figure.style.setProperty('--wiki-figure-min-height', '0px');
            return;
        }
        figure.style.removeProperty('aspect-ratio');
        figure.style.removeProperty('--wiki-figure-min-height');
    }

    function trackFigureImage(figure, img) {
        primeFigurePlaceholder(figure, img);

        const finish = (isError) => {
            figure.classList.remove('wiki-figure--loading');
            figure.classList.add(isError ? 'wiki-figure--error' : 'wiki-figure--ready');
            if (!isError) {
                const ratio = readFigureAspectRatio(img);
                if (ratio) {
                    figure.style.aspectRatio = ratio;
                }
            }
            figure.style.removeProperty('--wiki-figure-min-height');
        };

        if (img.complete) {
            finish(!img.naturalWidth);
            return;
        }

        img.addEventListener('load', () => finish(false), { once: true });
        img.addEventListener('error', () => finish(true), { once: true });
    }

    function enhanceArticleImages(root) {
        const container = root || pageContentEl;
        if (!container) {
            return;
        }

        container.querySelectorAll('.wiki-figure').forEach((figure) => {
            const img = figure.querySelector('.wiki-figure__img') || figure.querySelector('img');
            if (!img) {
                figure.classList.remove('wiki-figure--loading');
                figure.classList.add('wiki-figure--error');
                return;
            }
            trackFigureImage(figure, img);
        });

        container.querySelectorAll('img:not(.wiki-figure__img)').forEach((img) => {
            if (img.closest('.wiki-figure')) {
                return;
            }
            const figure = document.createElement('figure');
            figure.className = 'wiki-figure wiki-figure--loading';
            const loader = document.createElement('span');
            loader.className = 'wiki-figure__loader';
            loader.setAttribute('aria-hidden', 'true');
            img.classList.add('wiki-figure__img');
            img.parentNode.insertBefore(figure, img);
            figure.appendChild(img);
            figure.appendChild(loader);
            trackFigureImage(figure, img);
        });

        if (window.PortalWikiLightbox?.bindArticleImages) {
            window.PortalWikiLightbox.bindArticleImages(container);
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parentSlugOf(slug) {
        const parts = splitSlug(slug);
        if (parts.length <= 1) {
            return '';
        }
        return parts.slice(0, -1).join('/');
    }

    function syncSearchFieldState(isSearching) {
        if (!searchField || !searchInput) {
            return;
        }
        searchField.classList.toggle('has-value', Boolean(searchInput.value.trim()));
        searchField.classList.toggle('is-searching', Boolean(isSearching));
        if (clearSearchBtn) {
            clearSearchBtn.setAttribute('aria-hidden', searchInput.value.trim() ? 'false' : 'true');
            clearSearchBtn.tabIndex = searchInput.value.trim() ? 0 : -1;
        }
        if (searchSpinner) {
            searchSpinner.classList.toggle('hidden', !isSearching);
        }
    }

    function buildTreeHierarchy(items) {
        const flat = Array.isArray(items) ? items : [];
        const bySlug = new Map();
        flat.forEach((item) => {
            const slug = normalizeSlug(item.slug);
            if (!slug) {
                return;
            }
            bySlug.set(slug, {
                ...item,
                slug,
                children: []
            });
        });

        const roots = [];
        flat.forEach((item) => {
            const slug = normalizeSlug(item.slug);
            const node = bySlug.get(slug);
            if (!node) {
                return;
            }
            const parentSlug = normalizeSlug(item.parentSlug || parentSlugOf(slug));
            if (parentSlug && bySlug.has(parentSlug) && parentSlug !== slug) {
                bySlug.get(parentSlug).children.push(node);
                return;
            }
            if (Number(item.depth) === 0) {
                roots.push(node);
                return;
            }
            const slugParent = parentSlugOf(slug);
            if (slugParent && bySlug.has(slugParent)) {
                bySlug.get(slugParent).children.push(node);
                return;
            }
            roots.push(node);
        });

        const collator = new Intl.Collator('ru', { sensitivity: 'base' });
        function sortNodes(nodes) {
            nodes.sort((a, b) => collator.compare(String(a.title || ''), String(b.title || '')));
            nodes.forEach((node) => sortNodes(node.children));
        }
        sortNodes(roots);
        return roots;
    }

    function isBranchCollapsed(slug) {
        return state.collapsedSlugs.has(normalizeSlug(slug));
    }

    function toggleBranch(slug) {
        const normalized = normalizeSlug(slug);
        if (!normalized) {
            return;
        }
        if (state.collapsedSlugs.has(normalized)) {
            state.collapsedSlugs.delete(normalized);
        } else {
            state.collapsedSlugs.add(normalized);
        }
        renderTree(state.treeItems);
    }

    function treeNodeTitle(slug, fallbackTitle) {
        const resolved = titleForSlug(slug);
        if (resolved && !isLatinSlugTitle(resolved, slug)) {
            return resolved;
        }
        const fallback = String(fallbackTitle || '').trim();
        if (fallback && !isLatinSlugTitle(fallback, slug)) {
            return fallback;
        }
        return resolved || fallback || slug || 'Без названия';
    }

    function renderTreeNode(node, depth) {
        const slug = normalizeSlug(node.slug);
        const title = treeNodeTitle(slug, node.title);
        const children = Array.isArray(node.children) ? node.children : [];
        const hasChildren = children.length > 0;
        const collapsed = hasChildren && isBranchCollapsed(slug);
        const depthClass = depth === 0 ? ' wiki-tree__item--section' : '';
        const childrenHtml = hasChildren && !collapsed
            ? `<ul class="wiki-tree__children">${children.map((child) => renderTreeNode(child, depth + 1)).join('')}</ul>`
            : '';

        const toggleHtml = hasChildren
            ? `<button type="button" class="wiki-tree__toggle" data-toggle-slug="${encodeURIComponent(slug)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="${collapsed ? 'Раскрыть подраздел' : 'Свернуть подраздел'}">${collapsed ? '▸' : '▾'}</button>`
            : '<span class="wiki-tree__toggle-spacer" aria-hidden="true"></span>';

        return `
            <li class="wiki-tree__item${depthClass}" style="--wiki-depth:${depth}" data-slug="${encodeURIComponent(slug)}">
                <div class="wiki-tree__row">
                    ${toggleHtml}
                    <button
                        type="button"
                        class="wiki-tree__link"
                        data-slug="${encodeURIComponent(slug)}"
                        title="${escapeHtml(title)}"
                    ><span class="wiki-tree__link-text">${escapeHtml(title)}</span></button>
                </div>
                ${childrenHtml}
            </li>
        `;
    }

    function renderFlatTreeItem(item) {
        const slug = normalizeSlug(item.slug);
        const title = treeNodeTitle(slug, item.title);
        const depth = Number.isFinite(Number(item.depth)) ? Math.max(0, Number(item.depth)) : 0;
        return `
            <li class="wiki-tree__item wiki-tree__item--flat" style="--wiki-depth:${depth}">
                <div class="wiki-tree__row">
                    <span class="wiki-tree__toggle-spacer" aria-hidden="true"></span>
                    <button
                        type="button"
                        class="wiki-tree__link"
                        data-slug="${encodeURIComponent(slug)}"
                        title="${escapeHtml(title)}"
                    ><span class="wiki-tree__link-text">${escapeHtml(title)}</span></button>
                </div>
            </li>
        `;
    }

    function bindTreeInteractions() {
        treeRoot.querySelectorAll('.wiki-tree__link').forEach((button) => {
            button.addEventListener('click', () => {
                const encodedSlug = button.getAttribute('data-slug') || '';
                const slug = normalizeSlug(safeDecodeURIComponent(encodedSlug));
                if (!slug) return;
                setLocationSlug(slug);
            });
            button.addEventListener('mouseenter', () => {
                if (!window.matchMedia('(min-width: 993px)').matches) {
                    return;
                }
                const encodedSlug = button.getAttribute('data-slug') || '';
                const slug = normalizeSlug(safeDecodeURIComponent(encodedSlug));
                if (slug && api.prefetchPage) {
                    api.prefetchPage(slug);
                }
            }, { passive: true });
        });
        treeRoot.querySelectorAll('.wiki-tree__toggle').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const encodedSlug = button.getAttribute('data-toggle-slug') || '';
                toggleBranch(safeDecodeURIComponent(encodedSlug));
            });
        });
        updateActiveTreeLink();
    }

    function updateActiveTreeLink() {
        let activeNode = null;
        treeRoot.querySelectorAll('.wiki-tree__link').forEach((node) => {
            const encodedSlug = String(node.getAttribute('data-slug') || '');
            const isActive = normalizeSlug(safeDecodeURIComponent(encodedSlug)) === state.activeSlug;
            node.classList.toggle('is-active', isActive);
            if (isActive) {
                node.setAttribute('aria-current', 'page');
                activeNode = node;
            } else {
                node.removeAttribute('aria-current');
            }
        });
        if (activeNode && typeof activeNode.scrollIntoView === 'function') {
            activeNode.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
    }

    function bindSidebarToggle() {
        if (!sidebarToggleEl || !sidebarPanelEl) {
            return;
        }
        const isDesktop = () => window.matchMedia('(min-width: 993px)').matches;

        const setNavOpen = (open) => {
            const mobile = !isDesktop();
            const effectiveOpen = mobile ? open : true;

            sidebarToggleEl.setAttribute('aria-expanded', effectiveOpen && mobile ? 'true' : 'false');
            sidebarPanelEl.classList.toggle('is-open', effectiveOpen && mobile);

            if (sidebarBackdropEl) {
                const showBackdrop = effectiveOpen && mobile;
                sidebarBackdropEl.classList.toggle('hidden', !showBackdrop);
                sidebarBackdropEl.setAttribute('aria-hidden', showBackdrop ? 'false' : 'true');
            }

            document.body.classList.toggle('wiki-nav-open', effectiveOpen && mobile);
        };

        sidebarToggleEl.addEventListener('click', () => {
            const open = sidebarToggleEl.getAttribute('aria-expanded') !== 'true';
            setNavOpen(open);
        });

        if (sidebarBackdropEl) {
            sidebarBackdropEl.addEventListener('click', () => setNavOpen(false));
        }

        setNavOpen(false);
        window.matchMedia('(min-width: 993px)').addEventListener('change', () => setNavOpen(false));
    }

    function collapseSidebarOnMobile() {
        if (!sidebarToggleEl || !sidebarPanelEl || !window.matchMedia('(max-width: 992px)').matches) {
            return;
        }
        sidebarToggleEl.setAttribute('aria-expanded', 'false');
        sidebarPanelEl.classList.remove('is-open');
        sidebarBackdropEl?.classList.add('hidden');
        sidebarBackdropEl?.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('wiki-nav-open');
    }

    function renderTree(items) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            treeRoot.innerHTML = '<p class="wiki-sidebar__status">Список страниц пуст.</p>';
            return;
        }

        let html = '';
        if (state.isSearchMode) {
            html = list.map((item) => renderFlatTreeItem(item)).join('');
        } else {
            html = buildTreeHierarchy(list).map((node) => renderTreeNode(node, 0)).join('');
        }

        treeRoot.innerHTML = `<ul class="wiki-tree__list">${html}</ul>`;
        bindTreeInteractions();
    }

    function setArticleLoading(slug) {
        hideNotice();
        setPageLoading(true);
        pageTitleEl.textContent = 'Загрузка…';
        pageMetaEl.textContent = '';
        renderBreadcrumbs(slug);
        pageContentEl.innerHTML = '';
    }

    function renderPage(page) {
        const slug = normalizeSlug(page.slug || state.activeSlug);
        pageTitleEl.textContent = page.title || 'Страница Wiki';
        const updated = formatUpdatedAt(page.updatedAt);
        pageMetaEl.textContent = updated ? `Обновлено ${updated}` : '';
        renderBreadcrumbs(slug);
        const safeHtml = sanitizeClientHtml(String(page.html || '').trim());
        pageContentEl.innerHTML = safeHtml || '<p>Страница пуста.</p>';
        enhanceArticleImages(pageContentEl);
        if (openLinkEl) {
            openLinkEl.href = String(page.editUrl || state.config?.externalUrl || 'https://wiki.yandex.ru/');
        }
        hideNotice();
        setPageLoading(false);
        collapseSidebarOnMobile();
        document.title = `${page.title || 'База знаний'} · IT-Support · База знаний`;
    }

    function sanitizeClientHtml(rawHtml) {
        const blockedTags = new Set([
            'script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link',
            'style', 'svg', 'math', 'template', 'foreignobject'
        ]);
        const template = document.createElement('template');
        template.innerHTML = String(rawHtml || '');
        template.content.querySelectorAll('*').forEach((node) => {
            const tagName = node.tagName.toLowerCase();
            if (blockedTags.has(tagName)) {
                node.remove();
                return;
            }
            Array.from(node.attributes).forEach((attr) => {
                const name = attr.name.toLowerCase();
                const value = String(attr.value || '').trim();
                if (name.startsWith('on') || name === 'srcdoc' || name === 'style') {
                    node.removeAttribute(attr.name);
                    return;
                }
                if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^(javascript:|data:text\/html|vbscript:)/i.test(value)) {
                    node.removeAttribute(attr.name);
                }
            });

            if (tagName === 'a') {
                const href = String(node.getAttribute('href') || '').trim();
                if (!href) {
                    node.removeAttribute('target');
                    node.removeAttribute('rel');
                } else if (href.startsWith('/wiki/') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                    node.removeAttribute('target');
                    node.removeAttribute('rel');
                } else {
                    node.setAttribute('target', '_blank');
                    node.setAttribute('rel', 'noopener noreferrer');
                    node.setAttribute('referrerpolicy', 'no-referrer');
                }
            }

            if (tagName === 'img') {
                const src = String(node.getAttribute('src') || '').trim();
                if (!src || /^(javascript:|data:|vbscript:)/i.test(src)) {
                    node.remove();
                    return;
                }
                node.setAttribute('loading', node.getAttribute('loading') || 'lazy');
                node.setAttribute('decoding', node.getAttribute('decoding') || 'async');
                node.setAttribute('referrerpolicy', 'no-referrer');
            }
        });
        return template.innerHTML;
    }

    async function loadTreeSafe() {
        try {
            await loadTree();
        } catch (error) {
            const status = Number(error?.status || 0);
            if (needsWikiReauth(status)) {
                promptWikiReauth('Нужен повторный вход для доступа к Wiki...');
                return false;
            }
            setSidebarStatus('Не удалось загрузить дерево Wiki.');
            showNotice('Дерево Wiki временно недоступно. Статьи можно открывать по прямой ссылке.');
            return false;
        }
        return true;
    }

    function expandAncestors(slug) {
        let current = parentSlugOf(normalizeSlug(slug));
        while (current) {
            state.collapsedSlugs.delete(normalizeSlug(current));
            current = parentSlugOf(current);
        }
    }

    async function openPage(rawSlug) {
        const slug = normalizeSlug(rawSlug || state.baseSlug);
        if (!slug) {
            return;
        }
        expandAncestors(slug);
        const requestId = ++state.pageRequestId;
        state.activeSlug = slug;
        if (!state.isSearchMode) {
            renderTree(state.treeItems);
        } else {
            updateActiveTreeLink();
        }
        setArticleLoading(slug);
        try {
            const page = await api.getPage(slug);
            if (requestId !== state.pageRequestId) {
                return;
            }
            if (state.activeSlug !== normalizeSlug(page.slug || slug)) {
                return;
            }
            state.activeSlug = normalizeSlug(page.slug || slug);
            updateActiveTreeLink();
            const pageTitle = String(page.title || '').trim();
            if (pageTitle) {
                state.slugTitles.set(state.activeSlug, pageTitle);
            }
            renderPage(page);
            if (!state.isSearchMode) {
                renderTree(state.treeItems);
            }
        } catch (error) {
            if (requestId !== state.pageRequestId) {
                return;
            }
            const status = Number(error?.status || 0);
            if (status === 404) {
                showNotice('Страница не найдена в Wiki. Проверьте путь или откройте оригинал.');
            } else if (status === 403) {
                showNotice('Доступ к этой странице ограничен текущим разделом Wiki.');
            } else if (status === 401) {
                promptWikiReauth('Сессия истекла или нет доступа к Wiki. Выполняем повторный вход через Яндекс...');
            } else if (needsWikiReauth(status)) {
                promptWikiReauth('Нужен повторный вход для доступа к Wiki...');
            } else if (status === 502 || status === 504) {
                showNotice('Wiki API временно недоступен. Попробуйте обновить страницу через несколько секунд.');
            } else {
                showNotice('Не удалось загрузить страницу. Попробуйте снова через минуту.');
            }
            pageTitleEl.textContent = 'Страница недоступна';
            pageMetaEl.textContent = '';
            pageContentEl.innerHTML = '<p>Попробуйте обновить страницу или открыть оригинал в Wiki.</p>';
            setPageLoading(false);
        }
    }

    async function runWikiSearch(query) {
        const requestId = ++state.searchRequestId;
        const text = String(query || '').trim();
        syncSearchFieldState(true);
        if (searchAbortController) {
            searchAbortController.abort();
            searchAbortController = null;
        }
        if (!text) {
            state.isSearchMode = false;
            syncSearchFieldState(false);
            renderTree(state.treeItems);
            setSidebarStatus(`Страниц в разделе: ${state.treeItems.length}`);
            return;
        }

        state.isSearchMode = true;
        searchAbortController = new AbortController();
        setSidebarStatus(`Поиск: «${text}»...`);
        try {
            const response = await api.search(text, 50, { signal: searchAbortController.signal });
            if (requestId !== state.searchRequestId) {
                return;
            }
            const items = Array.isArray(response.items) ? response.items : [];
            renderTree(items);
            setSidebarStatus(items.length ? `Найдено: ${items.length}` : 'Совпадений не найдено');
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }
            if (requestId !== state.searchRequestId) {
                return;
            }
            state.isSearchMode = false;
            renderTree(state.treeItems);
            setSidebarStatus('Поиск временно недоступен. Показан полный список.');
        } finally {
            if (requestId === state.searchRequestId) {
                searchAbortController = null;
                syncSearchFieldState(false);
            }
        }
    }

    function queueWikiSearch(query) {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = window.setTimeout(() => {
            searchDebounceTimer = null;
            runWikiSearch(query);
        }, 280);
    }

    function renderDisabledState(configState) {
        const externalUrl = String(configState?.externalUrl || 'https://wiki.yandex.ru/');
        const safeExternalUrl = escapeHtml(externalUrl);
        setSidebarStatus('Wiki reader недоступен. Используйте внешний Wiki.');
        treeRoot.innerHTML = '';
        if (searchInput) searchInput.disabled = true;
        if (clearSearchBtn) clearSearchBtn.disabled = true;
        syncSearchFieldState(false);
        pageTitleEl.textContent = 'База знаний во внешней Wiki';
        pageMetaEl.textContent = '';
        pageContentEl.innerHTML = `
            <p>Встроенный reader отключен или не настроен.</p>
            <p><a href="${safeExternalUrl}" target="_blank" rel="noopener noreferrer">Открыть раздел в Wiki</a></p>
        `;
        if (openLinkEl) {
            openLinkEl.href = externalUrl;
        }
    }

    async function loadTree() {
        setTreeLoading(true);
        setSidebarStatus('Загрузка структуры Wiki...');
        try {
            const payload = await api.getTree();
            state.baseSlug = normalizeSlug(payload.baseSlug || state.config.baseSlug || '');
            state.baseSlugTitle = String(
                payload.rootTitle
                || state.config?.baseTitle
                || window.PortalConfig?.wiki?.baseTitle
                || ''
            ).trim();
            state.treeItems = Array.isArray(payload.items) ? payload.items : [];
            rebuildSlugTitleMap(payload.titlesBySlug || {});
            renderTree(state.treeItems);
            const suffix = payload.truncated ? ' (частичный список)' : '';
            setSidebarStatus(`Страниц в разделе: ${state.treeItems.length}${suffix}`);
            if (state.activeSlug) {
                renderBreadcrumbs(state.activeSlug);
            }
        } finally {
            setTreeLoading(false);
        }
    }

    function bindEvents() {
        window.addEventListener('hashchange', () => {
            const slug = getSlugFromLocation() || state.baseSlug;
            openPage(slug);
        });

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                syncSearchFieldState(false);
                queueWikiSearch(searchInput.value);
            });
        }

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                if (!searchInput) return;
                searchInput.value = '';
                syncSearchFieldState(false);
                runWikiSearch('');
                searchInput.focus();
            });
        }

        syncSearchFieldState(false);
        bindSidebarToggle();
    }

    function needsWikiReauth(status) {
        const code = Number(status || 0);
        return code === 401
            || (code === 503 && state.config?.authMode === 'delegated');
    }

    function promptWikiReauth(message) {
        showNotice(message || 'Нужен повторный вход для доступа к Wiki...');
        if (window.PortalAuth?.login) {
            window.setTimeout(() => {
                window.PortalAuth.login();
            }, 250);
        }
    }

    let wikiAppStarted = false;

    async function startWikiApp() {
        if (wikiAppStarted) {
            return;
        }
        wikiAppStarted = true;

        bindEvents();
        pageContentEl.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (!link || !pageContentEl.contains(link)) {
                return;
            }
            const href = String(link.getAttribute('href') || '').trim();
            if (!href.startsWith('/wiki/')) {
                return;
            }
            const hashIndex = href.indexOf('#');
            if (hashIndex < 0) {
                return;
            }
            event.preventDefault();
            const slug = decodeHashSlug(href.slice(hashIndex));
            if (!slug) {
                return;
            }
            setLocationSlug(slug);
            openPage(slug);
        });
        try {
            const initialSlug = getSlugFromLocation() || state.baseSlug;
            if (initialSlug && !getSlugFromLocation()) {
                setInitialHash(initialSlug);
            }
            const slugToOpen = getSlugFromLocation() || state.baseSlug;
            const treePromise = loadTreeSafe();
            let pageResult = { status: 'fulfilled' };
            if (slugToOpen) {
                try {
                    await openPage(slugToOpen);
                } catch (reason) {
                    pageResult = { status: 'rejected', reason };
                }
            }
            let treeResult;
            try {
                const treeValue = await treePromise;
                treeResult = { status: 'fulfilled', value: treeValue };
            } catch (reason) {
                treeResult = { status: 'rejected', reason };
            }
            if (pageResult.status === 'rejected') {
                const status = Number(pageResult.reason?.status || 0);
                if (needsWikiReauth(status)) {
                    promptWikiReauth('Нужен повторный вход для доступа к Wiki...');
                    wikiAppStarted = false;
                    return;
                }
                showNotice('Не удалось загрузить страницу. Попробуйте снова через минуту.');
            }
            if (treeResult.status === 'rejected') {
                wikiAppStarted = false;
                renderDisabledState(state.config);
                showNotice('Wiki временно недоступна. Можно открыть раздел во внешней Wiki.');
                return;
            }
            if (treeResult.value === false && pageResult.status !== 'fulfilled') {
                wikiAppStarted = false;
                return;
            }
        } catch (error) {
            wikiAppStarted = false;
            renderDisabledState(state.config);
            showNotice('Wiki временно недоступна. Можно открыть раздел во внешней Wiki.');
            return;
        }

        if (window.PortalWikiTour?.start) {
            scheduleWikiTour();
        }
    }

    function getAssetVersion() {
        return document.documentElement.getAttribute('data-asset-version') || '';
    }

    function loadWikiTourScript() {
        if (window.PortalWikiTour) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const version = getAssetVersion();
            script.src = version ? `/js/wiki/tour.js?v=${version}` : '/js/wiki/tour.js';
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Wiki tour script failed to load'));
            document.head.appendChild(script);
        });
    }

    function scheduleWikiTour() {
        const run = () => {
            loadWikiTourScript()
                .then(() => window.PortalWikiTour?.start?.())
                .catch(() => {});
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 4000 });
        } else {
            window.setTimeout(run, 2000);
        }
    }

    async function init() {
        try {
            state.config = await api.getConfig();
            if (openLinkEl && state.config?.externalUrl) {
                openLinkEl.href = state.config.externalUrl;
            }
        } catch {
            state.config = {
                enabled: false,
                configured: false,
                baseSlug: '',
                baseTitle: '',
                externalUrl: 'https://wiki.yandex.ru/'
            };
        }

        state.baseSlug = normalizeSlug(
            state.config.baseSlug || window.PortalConfig?.wiki?.baseSlug || ''
        );
        state.baseSlugTitle = String(
            state.config.baseTitle || window.PortalConfig?.wiki?.baseTitle || ''
        ).trim();
        if (state.baseSlug && state.baseSlugTitle) {
            rebuildSlugTitleMap({ [state.baseSlug]: state.baseSlugTitle });
        }

        if (!state.config.enabled || !state.config.configured) {
            renderDisabledState(state.config);
            return;
        }

        const authApi = window.PortalAuth;
        if (authApi && typeof authApi.whenReady === 'function' && authApi.isRequired?.()) {
            document.addEventListener('portal:auth-ready', (event) => {
                if (event.detail?.user) {
                    startWikiApp();
                }
            });
            const user = await authApi.whenReady();
            if (!user) {
                showNotice('Войдите через Яндекс для доступа к Wiki.');
                return;
            }
        }

        await startWikiApp();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); });
    } else {
        init();
    }
})();
