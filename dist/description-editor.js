/* Shared description editor. Quill 2.0.3 (BSD-3-Clause) is bundled locally. */
(function () {
  'use strict';
  const selector = '#maintenanceDescription, #editMaintenanceDescription, #scheduleDescription, textarea.item-description, textarea.lv-detail-desc-textarea, textarea[data-description-editor]';
  const instances = new WeakMap();
  const valueProperty = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Only these semantic elements survive. No attributes, URLs or event handlers.
  function render(value) {
    let text = String(value ?? '');
    // Keep descriptions saved by the previous Markdown editor readable.
    if (!/<\/?(?:p|br|strong|b|em|i|s|del|strike|blockquote|ul|ol|li)(?:\s|>)/i.test(text)) {
      if (window.marked) text = window.marked.parse(text, {gfm:true, breaks:true, async:false});
      else return escape(text).replace(/\n/g, '<br>');
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    function clean(node) {
      if (node.nodeType === 3) return escape(node.textContent);
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|SVG|MATH|TEMPLATE)$/.test(node.tagName)) return '';
      const children = Array.from(node.childNodes, clean).join('');
      const tag = node.tagName.toLowerCase() === 'del' ? 's' : node.tagName.toLowerCase();
      if (tag === 'br') return '<br>';
      return /^(p|strong|b|em|i|s|del|strike|blockquote|ul|ol|li)$/.test(tag) ? `<${tag}>${children}</${tag}>` : children;
    }
    return Array.from(doc.body.childNodes, clean).join('');
  }
  function plain(value) {
    const doc = new DOMParser().parseFromString(render(value).replace(/<br>|<\/(?:p|li|blockquote)>/g, '\n'), 'text/html');
    return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  function attach(field) {
    if (instances.has(field) || !window.Quill) return;
    const shell = document.createElement('div');
    shell.className = 'description-editor';
    const host = document.createElement('div');
    field.before(shell);
    shell.append(host, field);
    const editor = new Quill(host, {
      theme: 'snow', placeholder: field.placeholder || 'Description',
      formats: ['bold', 'italic', 'strike', 'blockquote', 'list'],
      modules: { toolbar: [[{list:'bullet'}, {list:'ordered'}], ['bold', 'strike', 'blockquote', 'italic']] }
    });
    instances.set(field, editor);
    if (field.matches('.item-description, .lv-detail-desc-textarea')) {
      shell.classList.add('description-editor-estimate');
      field.closest('.detail')?.classList.add('description-detail');
      const area = editor.root;
      let minimumHeight = 100;
      let frame;
      function grow() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!area.isConnected || !area.clientWidth) return;
          area.style.height = 'auto';
          area.style.height = Math.max(minimumHeight, area.scrollHeight) + 'px';
        });
      }
      // Preserve a height chosen using the native bottom-right resize handle.
      area.addEventListener('pointerdown', event => {
        const box = area.getBoundingClientRect();
        if (event.clientX < box.right - 22 || event.clientY < box.bottom - 22) return;
        const finish = () => { minimumHeight = Math.max(100, area.getBoundingClientRect().height); grow(); };
        document.addEventListener('pointerup', finish, {once:true});
      });
      let previousWidth = 0;
      new ResizeObserver(entries => {
        const width = entries[0].contentRect.width;
        if (width !== previousWidth) { previousWidth = width; grow(); }
      }).observe(shell);
      new MutationObserver(grow).observe(area, {childList:true, subtree:true, characterData:true});
      grow();
    }
    const toolbar = shell.querySelector('.ql-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Description formatting');
    const labels = ['Bulleted list', 'Numbered list', 'Bold', 'Strikethrough', 'Quote', 'Italic'];
    toolbar.querySelectorAll('button').forEach((button, index) => {
      button.type = 'button';
      button.title = labels[index];
      button.setAttribute('aria-label', labels[index]);
    });
    editor.root.setAttribute('role', 'textbox');
    editor.root.setAttribute('aria-multiline', 'true');
    editor.root.setAttribute('aria-label', field.labels?.[0]?.textContent.trim() || 'Description');
    editor.root.setAttribute('aria-required', String(field.required));
    function updateButtons() {
      const range = editor.getSelection();
      const format = range ? editor.getFormat(range) : {};
      toolbar.querySelectorAll('button').forEach(button => {
        const name = Array.from(button.classList).find(value => value.startsWith('ql-'))?.slice(3);
        const active = name === 'list' ? format.list === button.value : !!format[name];
        button.setAttribute('aria-pressed', String(active));
      });
    }
    editor.on('selection-change', updateButtons);
    editor.on('text-change', updateButtons);
    let updating = false;
    function load(value) {
      updating = true;
      editor.setContents(editor.clipboard.convert({html: render(value)}), 'silent');
      editor.root.removeAttribute('aria-invalid');
      updating = false;
    }
    load(field.value);
    // Preserve existing .value setters, save handlers, input listeners and form resets.
    Object.defineProperty(field, 'value', {
      configurable: true,
      get() { return valueProperty.get.call(this); },
      set(value) { valueProperty.set.call(this, value); if (!updating) load(valueProperty.get.call(this)); }
    });
    field.classList.add('description-editor-source');
    field.tabIndex = -1;
    field.setAttribute('aria-hidden', 'true');
    editor.on('text-change', () => {
      if (updating) return;
      const html = editor.getText().trim() ? render(editor.getSemanticHTML()) : '';
      valueProperty.set.call(field, html);
      editor.root.removeAttribute('aria-invalid');
      updating = true;
      field.dispatchEvent(new Event('input', {bubbles:true}));
      field.dispatchEvent(new Event('change', {bubbles:true}));
      updating = false;
    });
    field.addEventListener('input', () => { if (!updating) load(field.value); });
    editor.root.addEventListener('focus', () => field.dispatchEvent(new Event('focus')));
    shell.addEventListener('focusout', event => {
      if (!shell.contains(event.relatedTarget)) field.dispatchEvent(new Event('blur', {bubbles:true}));
    });
    field.addEventListener('invalid', event => { event.preventDefault(); editor.focus(); editor.root.setAttribute('aria-invalid', 'true'); });
    editor.root.addEventListener('input', () => editor.root.removeAttribute('aria-invalid'));
    field.form?.addEventListener('reset', () => setTimeout(() => load(field.value), 0));
    field.labels?.forEach(label => label.addEventListener('click', event => { event.preventDefault(); editor.focus(); }));
    const syncDisabled = () => {
      editor.enable(!field.disabled && !field.readOnly);
      toolbar.querySelectorAll('button').forEach(button => { button.disabled = field.disabled || field.readOnly; });
    };
    new MutationObserver(syncDisabled).observe(field, {attributes:true, attributeFilter:['disabled','readonly']});
    syncDisabled();
  }
  function scan(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.(selector)) attach(root);
    root.querySelectorAll(selector).forEach(attach);
  }
  window.DescriptionEditor = {render, plain, escape, attach, scan};
  function start() {
    scan(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)))
      .observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
