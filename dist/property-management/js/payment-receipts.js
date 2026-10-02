// Property management: payment receipts.
// Classic script: declarations share the page scope; startup runs in property-management.js.

// Export receipt as a PDF file
async function exportReceipt(paymentId) {
    const payment = state.payments.find(p => p._id === paymentId);
    if (!payment) {
        showNotification('Payment not found', 'error');
        return;
    }

    const tenant = state.tenants.find(t => t._id === payment.tenantId);
    const unit = state.units.find(u => u._id === payment.unitId);
    // Prefer the property linked to the payment; fallback to currentProperty
    const property = (state.properties || []).find(p => p._id === payment.projectId) || state.currentProperty;

    const formatCurrency = (n) => `$${(Number(n) || 0).toFixed(2)}`; // keep simple for PDF rows, detailed formatter below
    const toTitle = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const formatAddressLines = (prop) => {
        if (!prop) return ['Address: N/A'];
        const a = prop.address || {};
        // Support both Property schema (line1/line2) and Project schema (addressLine1/addressLine2)
        const line1 = a.line1 || a.addressLine1 || a.street || prop.line1 || '';
        const line2 = a.line2 || a.addressLine2 || a.suite || prop.line2 || '';
        const city = a.city || prop.city || '';
        const state = a.state || prop.state || '';
        const zip = a.zip || a.postalCode || prop.zip || '';
        const lines = [];
        if (line1) lines.push(line1);
        if (line2) lines.push(line2);
        let last = '';
        if (city) last += city;
        if (state) last += (last ? ', ' : '') + state;
        if (zip) last += (last ? ' ' : '') + zip;
        if (last) lines.push(last);
        if (!lines.length) return ['Address: N/A'];
        return lines;
    };

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Helper: fetch an image URL and convert to Data URL
    const fetchAsDataURL = async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return null;
            const blob = await res.blob();
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return null;
        }
    };

    // Try common logo locations
    let logoDataUrl = null;
    const logoCandidates = [
        '/images/logo.png',
        '/images/logo.jpg',
        '/public/images/logo.png',
        '/public/logo.png',
        '/logo.png'
    ];
    for (const path of logoCandidates) {
        logoDataUrl = await fetchAsDataURL(path);
        if (logoDataUrl) break;
    }

    // Theme colors
    // Adjusted brand palette
    const brand = { r: 31, g: 78, b: 121 }; // #1F4E79
    const success = { r: 39, g: 174, b: 96 };
    const warning = { r: 243, g: 156, b: 18 };
    const textDark = { r: 38, g: 50, b: 56 };   // slightly darker
    const textMuted = { r: 100, g: 116, b: 128 }; // cool gray
    const border = { r: 225, g: 232, b: 237 };

    // Small utility to lighten a color toward white
    const lighten = (c, amt = 0.2) => ({
        r: Math.min(255, Math.round(c.r + (255 - c.r) * amt)),
        g: Math.min(255, Math.round(c.g + (255 - c.g) * amt)),
        b: Math.min(255, Math.round(c.b + (255 - c.b) * amt))
    });

    // Header band with angled accent
    const headerH = 42; // taller for a modern, breathable header
    const headerW = 210; // A4 width in mm for jsPDF default
    const brandLight = lighten(brand, 0.22);
    doc.setFillColor(brand.r, brand.g, brand.b);
    doc.rect(0, 0, headerW, headerH, 'F');
    // Angled overlay on the right to add depth
    doc.setFillColor(brandLight.r, brandLight.g, brandLight.b);
    // Draw a triangle from mid-top to right-top to right-bottom
    doc.triangle(130, 0, headerW, 0, headerW, headerH, 'F');
    // Slim accent line below header
    doc.setFillColor(brandLight.r, brandLight.g, brandLight.b);
    doc.rect(0, headerH, headerW, 1.2, 'F');

    // Header content positions
    let headerTitleX = 14;
    const headerTitleY = 20;
    const headerSubY = 28;

    // Insert logo if available
    if (logoDataUrl) {
        try {
            const logoW = 18; // mm
            const logoH = 18; // mm
            const logoX = 14;
            const logoY = 6;
            doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
            headerTitleX = logoX + logoW + 6; // shift title to the right of logo
        } catch (e) {
            // If addImage fails, continue without logo
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('Payment Receipt', headerTitleX, headerTitleY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Blue Rain MF LLC', headerTitleX, headerSubY);

    // Payment status badge in header (always show PAID)
    const badgeX = 160, badgeY = 12, badgeW = 38, badgeH = 12;
    doc.setFillColor(success.r, success.g, success.b);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('PAID', badgeX + badgeW / 2, badgeY + 8, { align: 'center' });

    // Subtle watermark behind content
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(60);
    const wmColor = lighten({ r: 230, g: 236, b: 240 }, 0.15); // very light
    doc.setTextColor(wmColor.r, wmColor.g, wmColor.b);
    doc.text('BR', 170, 150, { align: 'center' });

    // Meta box on right — floating card overlapping header
    const metaX = 120;
    const boxTop = headerH - 8;
    const boxW = 76;
    const boxH = 34;
    // Faux shadow
    doc.setFillColor(235, 241, 246);
    doc.roundedRect(metaX + 1.2, boxTop + 1.2, boxW, boxH, 3, 3, 'F');
    // Card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(220, 230, 240);
    doc.setLineWidth(0.4);
    doc.roundedRect(metaX, boxTop, boxW, boxH, 3, 3, 'FD');
    const receiptNo = (payment._id || '').slice(-8).toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(textDark.r, textDark.g, textDark.b);
    doc.text('Receipt Details', metaX + 4, boxTop + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
    doc.text(`Receipt # : ${receiptNo}`, metaX + 4, boxTop + 15);
    doc.text(`Date      : ${formatDateDisplay(payment.date)}`, metaX + 4, boxTop + 21);
    doc.text(`Payment ID: ${(payment._id || '').substring(0, 12)}...`, metaX + 4, boxTop + 27);

    // Property address (actual address, not project name)
    doc.setTextColor(textDark.r, textDark.g, textDark.b);
    let y = headerH + 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Property Address', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const addrLines = formatAddressLines(property);
    doc.text(addrLines, 14, y);
    y += (addrLines.length * 6) + 6;

    // Separator
    doc.setDrawColor(230, 230, 230);
    doc.line(14, y, 196, y);
    y += 10;

    // Payer and Payment details columns
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Payor', 14, y);
    doc.text('Payment', 110, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const leftCol = [
        `Tenant: ${tenant ? tenant.name : 'N/A'}`,
        `Unit: ${unit ? unit.number : 'N/A'}`,
        tenant?.email ? `Email: ${tenant.email}` : null,
        tenant?.phone ? `Phone: ${tenant.phone}` : null
    ].filter(Boolean);
    leftCol.forEach((line, idx) => doc.text(line, 14, y + (idx * 6)));

    const rightY = y;
    const displayType = payment.type === 'custom' ? (payment.customType || 'Custom') : toTitle(payment.type || '');
    const rightCol = [
        `Type: ${displayType}`,
        `Method: ${toTitle(payment.method)}`,
        `Applied To: ${toTitle(payment.applyTo || 'rent')}`,
        (payment.applyTo && ['water','electric','trash','admin','late','other'].includes(payment.applyTo)) ? `Category: ${toTitle(payment.applyTo)}` : null,
        payment.applyTo === 'fee' && payment.feeType ? `Fee Type: ${toTitle(payment.feeType)}` : null,
        payment.applyTo === 'fee' && payment.feeLabel ? `Fee Label: ${payment.feeLabel}` : null,
        payment.periodMonth ? `Period: ${payment.periodMonth}` : null,
        `Reference: ${receiptNo}`
    ].filter(Boolean);
    rightCol.forEach((line, idx) => doc.text(line, 110, rightY + (idx * 6)));
    const blockHeight = Math.max(leftCol.length, rightCol.length) * 6;
    y = y + blockHeight + 12;

    // Wrapped Note section (full width) if a note exists
    if (payment.note) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(textDark.r, textDark.g, textDark.b);
        doc.text('Note', 14, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
        const wrappedNote = doc.splitTextToSize(payment.note, 182); // span near full printable width
        doc.text(wrappedNote, 14, y);
        y += wrappedNote.length * 5 + 8; // advance Y based on line count
        // Separator under note
        doc.setDrawColor(230, 230, 230);
        doc.line(14, y, 196, y);
        y += 10;
    }

    // Totals card
    const cardX = 14;
    const cardW = 182;
    const rowH = 8;
    const cardPadding = 5;
    const amount = Number(payment.amount) || 0;
    const late = Number(payment.lateFee) || 0;
    const totalPaid = amount + late;
    const balance = Number(payment.balance) || 0;

    // Compute compact card height for a single-row summary (includes title gap)
    const rowsCount = 1;
    const titleGap = 10;
    const cardH = cardPadding * 2 + titleGap + (rowH * rowsCount);
    // Card background
    doc.setFillColor(234, 246, 255);
    doc.roundedRect(cardX, y, cardW, cardH, 3, 3, 'F');
    // Card border
    doc.setDrawColor(border.r, border.g, border.b);
    doc.roundedRect(cardX, y, cardW, cardH, 3, 3);

    // Card title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(textDark.r, textDark.g, textDark.b);
    doc.text('Payment Summary', cardX + cardPadding, y + cardPadding + 2);

    // Rows
    const startY = y + cardPadding + titleGap;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const drawRow = (label, value, rowIndex, isEmphasis = false) => {
        const yy = startY + rowIndex * rowH;
        doc.setTextColor(textMuted.r, textMuted.g, textMuted.b);
        doc.text(label, cardX + cardPadding, yy);
        doc.setFont('helvetica', isEmphasis ? 'bold' : 'normal');
        doc.setTextColor(textDark.r, textDark.g, textDark.b);
        doc.text(value, cardX + cardW - cardPadding, yy, { align: 'right' });
        doc.setFont('helvetica', 'normal');
    };
    const totalPaidLabel = totalPaid < 0 ? 'Credit Applied' : 'Total Paid';
    drawRow(totalPaidLabel, formatCurrency(totalPaid), 0, true);
    

    y = y + cardH + 10;

    // Acknowledgement and footer
    doc.setDrawColor(230, 230, 230);
    doc.line(14, y, 196, y);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(brand.r, brand.g, brand.b);
    doc.setFontSize(12);
    doc.text('Thank you for your payment!', 105, y, { align: 'center' });
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(9.5);
    doc.text('Generated by Bluerain MF LLC  • (210) 981-9251', 105, y, { align: 'center' });

    // Filename uses tenant name if available
    const filename = `receipt_${tenant ? tenant.name.replace(/\s+/g, '_') : paymentId}.pdf`;
    doc.save(filename);
}

// Email receipt to the tenant using backend mailer (server builds the email content)
async function emailReceipt(paymentId) {
    try {
        const payment = (state.payments || []).find(p => p._id === paymentId);
        if (!payment) {
            showNotification('Payment not found', 'error');
            return;
        }

        const tenant = (state.tenants || []).find(t => t._id === payment.tenantId);
        if (!tenant || !tenant.email) {
            showNotification('Tenant email not available for this payment', 'error');
            return;
        }

        const property = (state.properties || []).find(p => p._id === payment.projectId) || state.currentProperty;
        if (!property || !property._id) {
            showNotification('Property context missing for this payment', 'error');
            return;
        }

        showLoader();

        // Call backend endpoint; server composes and sends the receipt email
        const res = await fetch(`/api/properties/${property._id}/payments/${paymentId}/send-receipt`, {
            method: 'POST'
        });

        if (!res.ok) {
            let msg = 'Error sending receipt email';
            try {
                const data = await res.json();
                if (data && data.message) msg = data.message;
            } catch (_) {}
            showNotification(msg, 'error');
            return;
        }

        showNotification(`Receipt emailed to ${tenant.email}`, 'success');
    } catch (err) {
        console.error('Error emailing receipt:', err);
        showNotification('Error sending receipt email', 'error');
    } finally {
        try { hideLoader(); } catch (_) {}
    }
}
