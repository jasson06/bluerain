const fs = require('fs');
const path = require('path');
const vm = require('vm');
const media = require('../dist/maintenance-media');
const dist = path.join(__dirname, '../dist');
test('request cards load six thumbnails while the full gallery stays accessible', () => {
  const source = fs.readFileSync(path.join(dist,'property-management/js/maintenance-requests.js'),'utf8');
  const fn = source.slice(source.indexOf('function renderMaintenancePhotoGalleryContent('),source.indexOf('function handlePropertyManagementMaintenancePhotoLoad('));
  const ctx = { MaintenanceMedia: media }; vm.createContext(ctx); vm.runInContext(fn,ctx);
  const photos = Array.from({length:30},(_,i)=>`/uploads/maintenance/photo-${i}.jpg`);
  const html = ctx.renderMaintenancePhotoGalleryContent({_id:'request',photos},'property');
  expect((html.match(/<img /g)||[])).toHaveLength(6);
  expect(html).toContain('View all 30 photos'); expect(html).toContain('size=thumb');
  expect(html).not.toContain('src="/uploads/');
});
test('recurring galleries keep each visit separate and load at most six thumbnails', () => {
  let source=fs.readFileSync(path.join(dist,'maintenance-history.js'),'utf8');
  source=source.replace('{ render, historyButton, summary, qcBadge }','{ render, historyButton, summary, qcBadge, gallery }');
  const ctx={window:{},MaintenanceMedia:media,location:{origin:'https://example.test'},URL,document:{addEventListener(){},documentElement:{}},MutationObserver:class{observe(){}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const photos=Array.from({length:20},(_,i)=>`/uploads/visit-a-${i}.jpg`);
  const html=ctx.window.RecurringMaintenanceHistory.gallery(photos,'before');
  const other=ctx.window.RecurringMaintenanceHistory.gallery(['/uploads/visit-b.jpg'],'after');
  expect((html.match(/<img /g)||[])).toHaveLength(6);expect(html).toContain('View all 20 photos');
  expect(html).not.toContain('visit-b');expect(other).not.toContain('visit-a');
  expect(html).toContain('data-gallery=');expect(html).toContain('visit-a-19');
});
