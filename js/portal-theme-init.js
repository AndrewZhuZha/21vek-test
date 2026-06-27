(function () {
    var storageKey = 'portal-theme';
    var theme = null;

    try {
        var saved = window.localStorage.getItem(storageKey);
        if (saved === 'dark' || saved === 'light') {
            theme = saved;
        }
    } catch (error) {
        // ignore blocked storage
    }

    if (!theme) {
        var prefix = storageKey + '=';
        var entries = document.cookie ? document.cookie.split('; ') : [];
        for (var i = 0; i < entries.length; i += 1) {
            if (entries[i].indexOf(prefix) === 0) {
                var value = entries[i].slice(prefix.length);
                if (value === 'dark' || value === 'light') {
                    theme = value;
                    break;
                }
            }
        }
    }

    if (!theme) {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }

    document.documentElement.setAttribute('data-theme', theme);
})();
