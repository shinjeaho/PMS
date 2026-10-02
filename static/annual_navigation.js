document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.annual-list-btn').forEach(button => {
        button.addEventListener('click', () => {
            const navigate = path => {
                const target = new URL(path, window.location.origin);
                if (['annual', 'complete'].includes(button.dataset.returnView)) {
                    target.search = '';
                    target.hash = '';
                    target.searchParams.set('view', button.dataset.returnView);
                }
                window.location.href = target.pathname + target.search + target.hash;
            };
            // Restore the originating business list, including its query filters.
            if (document.referrer) {
                const previous = new URL(document.referrer);
                if (previous.origin === window.location.origin
                    && /^\/PMS_Business\/\d{4}\/?$/.test(previous.pathname)) {
                    navigate(previous.pathname + previous.search + previous.hash);
                    return;
                }
            }
            const year = /^\d{4}$/.test(button.dataset.year || '')
                ? button.dataset.year : new Date().getFullYear();
            navigate(`/PMS_Business/${year}`);
        });
    });
});
