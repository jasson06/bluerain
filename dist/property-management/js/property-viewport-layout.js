// Property management: viewport sizing for property tabs and record lists.

function propertyViewportBottomSpace(dashboard) {
    const main = dashboard.closest('.main-content');
    const padding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    const navigation = document.getElementById('mobileBottomNav');
    const fixedNavigation = navigation?.getClientRects().length && getComputedStyle(navigation).position === 'fixed'
        ? navigation.getBoundingClientRect().height : 0;
    return Math.max(padding, fixedNavigation) + 8;
}

function propertyViewportTrailingSpace(root, pane) {
    let space = parseFloat(getComputedStyle(root).marginBottom) || 0;
    for (let node = root; node && node !== pane; node = node.parentElement) {
        const parentStyle = getComputedStyle(node.parentElement);
        space += (parseFloat(parentStyle.paddingBottom) || 0) + (parseFloat(parentStyle.borderBottomWidth) || 0);
        for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
            if (!sibling.getClientRects().length) continue;
            const style = getComputedStyle(sibling);
            space += sibling.getBoundingClientRect().height
                + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
            if (parentStyle.display === 'grid' || (parentStyle.display === 'flex' && parentStyle.flexDirection === 'column')) {
                space += parseFloat(parentStyle.rowGap) || 0;
            }
        }
    }
    return space;
}

function updatePropertyViewportLayout() {
    const dashboard = document.getElementById('propertyDashboard');
    const pane = dashboard?.querySelector('.tab-pane.active');
    if (!pane?.getClientRects().length) return;
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
    const gutter = propertyViewportBottomSpace(dashboard);
    const documentTop = element => element.getBoundingClientRect().top + window.scrollY;
    const setHeight = (element, key, height) => {
        const value = `${Math.max(0, Math.floor(height))}px`;
        if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
    };
    setHeight(pane, '--property-pane-height', bottom - documentTop(pane) - gutter);
    const selectors = '.property-record-scroll, #paymentsList > .table-responsive, #paymentWorkspaceOperational, #paymentWorkspaceLedger, #announcementsList';
    pane.querySelectorAll(selectors).forEach(root => {
        if (!root.getClientRects().length || root.parentElement.closest(selectors)) return;
        if (!root.classList.contains('property-viewport-scroll')) root.classList.add('property-viewport-scroll');
        const minimum = Math.min(160, bottom * .35);
        setHeight(root, '--property-record-height', Math.max(minimum,
            bottom - documentTop(root) - gutter - propertyViewportTrailingSpace(root, pane)));
    });
}

function initializePropertyViewportLayout() {
    const dashboard = document.getElementById('propertyDashboard');
    if (!dashboard) return;
    let frame = null;
    const schedule = () => {
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
            frame = null;
            updatePropertyViewportLayout();
        });
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(dashboard, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden']});
    const sizes = new ResizeObserver(schedule);
    sizes.observe(dashboard);
    const main = dashboard.closest('.main-content');
    if (main) sizes.observe(main);
    const toolbar = document.querySelector('.top-tools-bar');
    if (toolbar) sizes.observe(toolbar);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    document.fonts?.ready.then(schedule);
    schedule();
}

document.addEventListener('DOMContentLoaded', initializePropertyViewportLayout, {once: true});
