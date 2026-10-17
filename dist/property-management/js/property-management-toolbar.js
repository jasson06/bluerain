
function updatePortfolioToolbarOffset() {
    const toolbar = document.querySelector('.top-tools-bar'); if (!toolbar) return;
    const height = Math.ceil(toolbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--portfolio-toolbar-height', `${height}px`);
}
let stopPortfolioTabAlignment = null;

function watchMobilePortfolioTabAlignment() {
    stopPortfolioTabAlignment?.();
    if (window.innerWidth > 900) return;
    const section = document.getElementById('portfolioOverviewSection');
    if (!section) return;
    let frame = null;
    let touch = null;
    const schedule = () => {
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
            frame = null;
            if (!section.getClientRects().length || window.innerWidth > 900) {
                stopPortfolioTabAlignment?.();
                return;
            }
            scrollPortfolioTabsBelowToolbar(false);
        });
    };
    const observer = new ResizeObserver(schedule);
    [section, section.querySelector('.portfolio-overview-header'),
        document.getElementById('portfolioExecutiveKpis'),
        document.getElementById('portfolioComparisonTable'),
        document.getElementById('portfolioComparisonPagination'),
        document.querySelector('.top-tools-bar')].filter(Boolean).forEach(node => observer.observe(node));
    const onStart = event => {
        const point = event.touches[0];
        touch = point ? {x: point.clientX, y: point.clientY} : null;
    };
    const onMove = event => {
        const point = event.touches[0];
        if (touch && point && Math.abs(point.clientY - touch.y) > 8
            && Math.abs(point.clientY - touch.y) > Math.abs(point.clientX - touch.x)) stopPortfolioTabAlignment?.();
    };
    const onWheel = event => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) stopPortfolioTabAlignment?.();
    };
    const onKey = event => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopPortfolioTabAlignment?.();
    };
    document.addEventListener('touchstart', onStart, {passive: true});
    document.addEventListener('touchmove', onMove, {passive: true});
    document.addEventListener('wheel', onWheel, {passive: true});
    document.addEventListener('keydown', onKey);
    stopPortfolioTabAlignment = () => {
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
        document.removeEventListener('touchstart', onStart);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKey);
        stopPortfolioTabAlignment = null;
    };
}

function scrollPortfolioTabsBelowToolbar(watchLayout = true) {
    if (watchLayout) watchMobilePortfolioTabAlignment();
    requestAnimationFrame(() => {
        updatePortfolioToolbarOffset();
        const tabs = document.getElementById('portfolioWorkspaceTabs');
        if (!tabs || !tabs.getClientRects().length) return;
        const section = document.getElementById('portfolioOverviewSection');
        const toolbar = document.querySelector('.top-tools-bar');
        const scroller = document.scrollingElement || document.documentElement;
        const toolbarHeight = Math.ceil(toolbar?.getBoundingClientRect().height || 0);
        const mobile = window.innerWidth <= 900;
        let scrollReserve = mobile && section
            ? parseFloat(section.style.getPropertyValue('--portfolio-tabs-scroll-reserve')) || 0 : 0;
        if (section && !mobile) {
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
            behavior: mobile || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
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
