/** CSP-safe dynamic layout via Constructed Stylesheets (no inline style=). */
window.PortalDynamicStyles = (function () {
    const sheets = new Map();

    /**
     * @param {string} id
     * @param {string} cssText
     */
    function setRules(id, cssText) {
        let sheet = sheets.get(id);
        if (!sheet) {
            sheet = new CSSStyleSheet();
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
            sheets.set(id, sheet);
        }
        sheet.replaceSync(String(cssText || ''));
    }

    function clear(id) {
        const sheet = sheets.get(id);
        if (!sheet) {
            return;
        }
        sheet.replaceSync('');
    }

    return { setRules, clear };
})();
