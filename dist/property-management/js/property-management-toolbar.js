
function updatePortfolioToolbarOffset() {
    const toolbar = document.querySelector('.top-tools-bar'); if (!toolbar) return;
    const height = Math.ceil(toolbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--portfolio-toolbar-height', `${height}px`);
}
function scrollPortfolioTabsBelowToolbar() {
    requestAnimationFrame(() => {
        updatePortfolioToolbarOffset();
        const tabs = document.getElementById('portfolioWorkspaceTabs');
        if (!tabs || !tabs.getClientRects().length) return;
        const section = document.getElementById('portfolioOverviewSection');
        const toolbar = document.querySelector('.top-tools-bar');
        const scroller = document.scrollingElement || document.documentElement;
        const toolbarHeight = Math.ceil(toolbar?.getBoundingClientRect().height || 0);
        let scrollReserve = 0;
        if (section) {
            section.style.setProperty('--portfolio-tabs-scroll-reserve', '0px');
            section.getBoundingClientRect();
        }
        let targetScrollTop = scroller.scrollTop + tabs.getBoundingClientRect().top - toolbarHeight;
        for (let pass = 0; section && pass < 3; pass += 1) {
            const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            const missingScrollRoom = Math.max(0, Math.ceil(targetScrollTop - maxScrollTop));
            if (!missingScrollRoom) break;
            scrollReserve += missingScrollRoom;
            section.style.setProperty('--portfolio-tabs-scroll-reserve', `${scrollReserve}px`);
            section.getBoundingClientRect();
            targetScrollTop = scroller.scrollTop + tabs.getBoundingClientRect().top - toolbarHeight;
        }
        scroller.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
        const selected = tabs.querySelector('[data-portfolio-view].active');
        if (selected) {
            const bar = tabs.getBoundingClientRect(), button = selected.getBoundingClientRect();
            if (button.left < bar.left) tabs.scrollLeft += button.left - bar.left - 8;
            else if (button.right > bar.right) tabs.scrollLeft += button.right - bar.right + 8;
        }
    });
}
function initializeStickyPortfolioTabs() {
    const toolbar = document.querySelector('.top-tools-bar'); if (!toolbar || toolbar.dataset.portfolioStickyBound) return;
    toolbar.dataset.portfolioStickyBound = 'true';
    updatePortfolioToolbarOffset();
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(updatePortfolioToolbarOffset);
        observer.observe(toolbar);
    }
    window.addEventListener('resize', updatePortfolioToolbarOffset, { passive: true });
    document.fonts?.ready.then(updatePortfolioToolbarOffset);
}
document.addEventListener('DOMContentLoaded', initializeStickyPortfolioTabs);

