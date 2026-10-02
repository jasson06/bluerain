
(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const originalOrder = new WeakMap();
    function cellText(cell) {
        if (!cell) return '';
        if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue;
        const control = cell.querySelector('select,input:not([type=checkbox]):not([type=radio]),textarea');
        if (control) return control.tagName === 'SELECT' ? control.selectedOptions[0]?.textContent || '' : control.value;
        return cell.textContent.trim();
    }
    function numberValue(text) {
        const cleaned = String(text).trim().replace(/[$£€,%\s]/g, '').replace(/^\((.*)\)$/, '-$1');
        return cleaned && /^[-+]?\d*\.?\d+$/.test(cleaned) ? Number(cleaned) : null;
    }
    function sortType(label, table, index) {
        if (/date|created|updated|submitted|scheduled|next due|move.?in|lease (start|end)|expires|expiration|added|available|^period$/i.test(label)) return 'date';
        if (/amount|balance|cost|rent|collected|remaining|outstanding|expenses|income|\bnoi\b|occupancy|collection|count|^units$|^tenants$|^vacant$|^occupied$|deposit|fee|price/i.test(label)) return 'number';
        const values = Array.from(table.tBodies).flatMap(body => Array.from(body.rows)).filter(row => row.cells.length > index && row.cells[index].colSpan === 1).map(row => cellText(row.cells[index])).filter(Boolean);
        return values.length && values.every(value => numberValue(value) !== null) ? 'number' : 'text';
    }
    function valueOf(text, type) {
        if (!text || /^(?:—|-|n\/a|not set|unknown)$/i.test(text.trim())) return null;
        if (type === 'number') return numberValue(text);
        if (type === 'date') { const value = Date.parse(text); return Number.isNaN(value) ? null : value; }
        return text;
    }
    function sortRows(table, header, direction) {
        const index = header.cellIndex, type = header.dataset.pmSortType;
        for (const body of table.tBodies) {
            const rows = Array.from(body.rows);
            // Leave grouped rows, detail rows, and empty-state messages intact.
            if (rows.some(row => Array.from(row.cells).some(cell => cell.colSpan > 1 || cell.rowSpan > 1))) continue;
            rows.forEach((row, i) => { if (!originalOrder.has(row)) originalOrder.set(row, i); });
            rows.sort((a, b) => {
                if (!direction) return originalOrder.get(a) - originalOrder.get(b);
                const av = valueOf(cellText(a.cells[index]), type), bv = valueOf(cellText(b.cells[index]), type);
                if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
                return (type === 'text' ? collator.compare(av, bv) : av - bv) * (direction === 'asc' ? 1 : -1);
            });
            // Move existing nodes to preserve row handlers, selections and edits.
            body.append(...rows);
        }
        table.querySelectorAll('thead th').forEach(th => {
            if (th.closest('table') !== table) return;
            const button = th.querySelector('.pm-column-sort');
            if (button) {
                const activeDirection = th === header ? direction : '';
                th.setAttribute('aria-sort', activeDirection ? activeDirection === 'asc' ? 'ascending' : 'descending' : 'none');
                updateSortButton(button, th, activeDirection);
            }
        });
    }
    function updateSortButton(button, header, direction) {
        const labels = header.dataset.pmSortType === 'date' ? ['oldest first', 'newest first'] : header.dataset.pmSortType === 'number' ? ['low to high', 'high to low'] : ['A–Z', 'Z–A'];
        const next = direction === 'asc' ? labels[1] : labels[0];
        button.innerHTML = `<span aria-hidden="true">${direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}</span>`;
        button.setAttribute('aria-label', `Sort ${button.dataset.label}: ${next}`);
        button.title = `Sort ${button.dataset.label}: ${next} (rows on this page)`;
    }
    function enhanceTables() {
        document.querySelectorAll('table').forEach(table => {
            if (!table.tHead || table.tHead.rows.length !== 1) return;
            Array.from(table.tHead.rows[0].cells).forEach(header => {
                if (header.tagName !== 'TH' || header.colSpan !== 1 || header.querySelector('.pm-column-sort')) return;
                const label = header.textContent.trim();
                if (!label || /^(actions?|select|options?)$/i.test(label) || header.querySelector('button,input,select')) return;
                const type = sortType(label, table, header.cellIndex);
                header.dataset.pmSortType = type;
                header.setAttribute('aria-sort', 'none');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'pm-column-sort';
                button.dataset.label = label;
                updateSortButton(button, header, '');
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    sortRows(table, header, header.getAttribute('aria-sort') === 'ascending' ? 'desc' : 'asc');
                });
                button.addEventListener('keydown', event => event.stopPropagation());
                header.append(button);
            });
        });
    }
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            observer.disconnect();
            enhanceTables();
            observer.observe(document.body, { childList: true, subtree: true });
        });
    });
    enhanceTables();
    observer.observe(document.body, { childList: true, subtree: true });
})();
