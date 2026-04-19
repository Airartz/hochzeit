// Template-Loader: Lädt das aktive Template CSS dynamisch
(async function loadTemplate() {
    try {
        const res = await fetch('/api/gallery');
        const settings = await res.json();
        const template = settings.site_template || 'classic';

        if (template !== 'classic') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `/css/template-${template}.css`;
            link.id = 'template-css';
            document.head.appendChild(link);
        }
    } catch (e) {
        // Fallback: Classic template
    }
})();
