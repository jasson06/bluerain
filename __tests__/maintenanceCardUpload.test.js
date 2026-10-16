const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../dist/property-management/js/maintenance-requests.js'), 'utf8');

function setup(request, contextSource, deferred = false) {
    const target = {
        dataset: { requestId: request._id, source: contextSource },
        isConnected: true,
        appendChild: jest.fn()
    };
    const input = { files: [{ name: 'repair.jpg', type: 'image/jpeg', size: 100 }] };
    const state = {
        maintenanceRequests: [{ ...request }],
        portfolioMaintenance: [{ ...request }],
        currentProperty: { _id: 'property-1' },
        currentTab: 'maintenance',
        portfolioWorkspaceMode: 'maintenance'
    };
    const updated = { photos: ['/uploads/maintenance/repair.jpg'], afterPhotos: [], updatedAt: '2026-10-16' };
    const upload = jest.fn(async (url, options, node) => {
        if (!node?.isConnected || !node.appendChild) throw Error('Photo upload area is unavailable.');
        return { ok: true, json: async () => updated };
    });
    const context = vm.createContext({
        state, API_URL: '/api',
        document: {
            createElement: jest.fn(() => input),
            querySelectorAll: jest.fn(selector => selector === '[data-maint-photo-upload]' ? [target] : [])
        },
        FormData: class {
            constructor() { this.fields = []; }
            append(key, value) { this.fields.push([key, value]); }
        },
        MaintenanceMedia: { upload, preview: url => url },
        portfolioPropertyId: () => 'property-1',
        showNotification: jest.fn(),
        invalidateCache: jest.fn(),
        renderUnifiedPortfolioWorkspace: jest.fn(),
        applyPropertyMaintenanceFilters: jest.fn(),
        scheduleMaintenancePhotoHydration: jest.fn()
    });
    input.click = jest.fn();
    const functions = source.slice(source.indexOf('function openMaintenancePhotoUpload('), source.indexOf('function shouldDeferMaintenancePhotos('));
    vm.runInContext(functions, context);
    context.shouldDeferMaintenancePhotos = () => deferred;
    context.renderMaintenancePhotoGalleryLoadingState = () => '<span>Loading photos</span>';
    context.renderMaintenancePhotoGalleryContent = () => '<span>Existing photos</span>';
    return { context, state, input, upload, target, updated };
}

describe.each(['property', 'portfolio'])('%s maintenance card uploads', contextSource => {
    test.each([
        ['first photo', {}, false],
        ['existing request photos', { photos: ['/uploads/before.jpg'] }, false],
        ['existing after photos', { afterPhotos: ['/uploads/after.jpg'] }, false],
        ['deferred photos', { photos: ['/uploads/before.jpg'] }, true]
    ])('uploads directly from the card: %s', async (label, photos, deferred) => {
        const request = { _id: 'request-1', ...photos };
        const { context, state, input, upload, target, updated } = setup(request, contextSource, deferred);
        const html = context.renderMaintenancePhotoGallery(request, contextSource);
        expect(html).toContain('data-maint-photo-upload="true"');
        expect(html).toContain('data-request-id="request-1"');
        expect(html).toContain(`data-source="${contextSource}"`);
        expect(html).toContain('+ Upload photos');
        expect(html.includes('data-maint-photo-gallery="true"')).toBe(Boolean(photos.photos || photos.afterPhotos));
        if (deferred) expect(html).toContain('Loading photos');

        context.openMaintenancePhotoUpload(request._id, contextSource);
        expect(input.click).toHaveBeenCalledTimes(1);
        await input.onchange();

        expect(upload).toHaveBeenCalledTimes(1);
        const [url, options, node] = upload.mock.calls[0];
        expect(url).toBe('/api/properties/property-1/maintenance/request-1');
        expect(options.method).toBe('PUT');
        expect(options.body.fields).toEqual([['photos', input.files[0]]]);
        expect(node).toBe(target);
        expect(state.maintenanceRequests[0].photos).toEqual(updated.photos);
        expect(state.portfolioMaintenance[0].photos).toEqual(updated.photos);
        expect(context.invalidateCache).toHaveBeenCalledWith('maintenance');
        expect(context.scheduleMaintenancePhotoHydration).toHaveBeenCalledWith(contextSource);
        expect(context.showNotification).toHaveBeenLastCalledWith('1 photo uploaded', 'success');
        expect(state.maintenancePhotoUploads[request._id]).toBeUndefined();
    });

    test('reports upload failure and allows another attempt', async () => {
        const request = { _id: 'request-1' };
        const { context, state, input, upload } = setup(request, contextSource);
        upload.mockRejectedValueOnce(Error('Network error'));
        context.openMaintenancePhotoUpload(request._id, contextSource);
        await input.onchange();
        expect(context.showNotification).toHaveBeenLastCalledWith('Network error', 'error');
        expect(context.invalidateCache).not.toHaveBeenCalled();
        expect(state.maintenancePhotoUploads[request._id]).toBeUndefined();

        context.openMaintenancePhotoUpload(request._id, contextSource);
        await input.onchange();
        expect(context.showNotification).toHaveBeenLastCalledWith('1 photo uploaded', 'success');
    });
});
