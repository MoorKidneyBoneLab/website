/* Moor Lab website editor.
   Plain JavaScript, no libraries. Loads ../index.html into a frame, makes its
   text editable, and downloads a clean index.html with the changes. */
(function () {
  'use strict';

  var SITE_ROOT = new URL('../', location.href);
  var PAGE_URL = new URL('index.html', SITE_ROOT);
  var DRAFT_KEY = 'moorlab-editor-draft-v1';

  // Elements whose text can be edited.
  var EDITABLE = [
    'main h1', 'main h2', 'main h3', 'main .h3',
    'main p', 'footer p', 'main figcaption', 'footer address',
    'main dt', 'main dd',
    '.pubs > li', '.plain > li', '.links > li',
    '.dated > li > span', '.news-list > li > span',
    '.people li > strong', '.people li > span'
  ].join(',');

  // Elements that can be moved, duplicated and deleted.
  var REPEATABLE = [
    '.news-list > li', '.pubs > li', '.plain > li', '.links > li', '.dated > li', '.people > li',
    '.questions > div', '.block .wrap > p', '.pi > p'
  ].join(',');

  var frame = document.getElementById('site');
  var statusEl = document.getElementById('status');
  var btnDownload = document.getElementById('btn-download');
  var btnOpen = document.getElementById('btn-open');
  var fileInput = document.getElementById('file-input');
  var linkbar = document.getElementById('linkbar');
  var linkInput = document.getElementById('link-url');
  var draftbar = document.getElementById('draftbar');
  var draftText = document.getElementById('draft-text');
  var toastEl = document.getElementById('toast');
  var help = document.getElementById('help');

  var doc = null;          // the frame's document
  var controls = null;     // floating item toolbar inside the frame
  var hoverItem = null;
  var currentLink = null;
  var dirty = false;
  var downloaded = false;
  var saveTimer = null;
  var toastTimer = null;
  var pendingDraft = null;

  /* ---------- storage (guarded: private modes can refuse it) ---------- */
  function readDraft() {
    try { var raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeDraft(html) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ html: html, time: Date.now() })); return true; }
    catch (e) { return false; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------- status and toast ---------- */
  function setStatus(text, isDirty) {
    statusEl.textContent = text;
    statusEl.classList.toggle('dirty', !!isDirty);
  }

  function toast(message, actionLabel, action) {
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    var span = document.createElement('span');
    span.textContent = message;
    toastEl.appendChild(span);
    if (actionLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', function () { toastEl.hidden = true; action(); });
      toastEl.appendChild(b);
    }
    toastEl.hidden = false;
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, actionLabel ? 9000 : 3500);
  }

  /* ---------- loading ---------- */
  function mount(html) {
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    if (!parsed.querySelector('main')) {
      toast('That file doesn’t look like the lab website’s index.html.');
      return;
    }
    // Resolve the page's relative paths (assets/…) against the site folder.
    var base = parsed.createElement('base');
    base.setAttribute('href', SITE_ROOT.href);
    base.setAttribute('data-editor', '');
    parsed.head.insertBefore(base, parsed.head.firstChild);

    frame.onload = setup;
    frame.srcdoc = '<!doctype html>\n' + parsed.documentElement.outerHTML;
  }

  function loadFromSite() {
    setStatus('Loading the website…');
    return fetch(PAGE_URL.href, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      });
  }

  /* ---------- setting up the editable page ---------- */
  function setup() {
    doc = frame.contentDocument;
    if (!doc) return;

    var style = doc.createElement('style');
    style.setAttribute('data-editor', '');
    style.textContent =
      '[contenteditable]{outline:1px dashed transparent;outline-offset:3px;border-radius:2px;cursor:text}' +
      '[contenteditable]:hover{outline-color:rgba(29,115,86,.5)}' +
      '[contenteditable]:focus{outline:2px solid #1d7356;background:rgba(29,115,86,.07)}' +
      '[contenteditable] a{cursor:text}' +
      '.ed-controls{position:absolute;z-index:50;display:flex;gap:2px;padding:3px;border-radius:7px;' +
      'background:#17222b;box-shadow:0 4px 14px rgba(0,0,0,.25);font:12px/1 system-ui,sans-serif}' +
      '.ed-controls[hidden]{display:none}' +
      '.ed-controls button{all:unset;color:#fff;padding:5px 8px;border-radius:5px;cursor:pointer}' +
      '.ed-controls button:hover,.ed-controls button:focus-visible{background:rgba(255,255,255,.18)}' +
      '.ed-controls .del:hover{background:#b3343f}' +
      '.ed-flash{animation:edflash 1.2s ease-out}' +
      '@keyframes edflash{from{background:rgba(29,115,86,.22)}to{background:transparent}}';
    doc.head.appendChild(style);

    var nodes = doc.querySelectorAll(EDITABLE);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('contenteditable', 'true');
      nodes[i].setAttribute('spellcheck', 'true');
    }

    buildControls();

    doc.addEventListener('input', onChange);
    doc.addEventListener('paste', onPaste);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('click', onClick);
    doc.addEventListener('mouseover', onHover);
    doc.addEventListener('selectionchange', updateLinkbar);
    doc.defaultView.addEventListener('keydown', onShortcut);

    btnDownload.disabled = false;
    dirty = false;
    setStatus('Ready. Click any text to edit.');
    checkDraft();
  }

  /* ---------- draft handling ---------- */
  function checkDraft() {
    var draft = pendingDraft || readDraft();
    pendingDraft = null;
    if (!draft || !draft.html) { draftbar.hidden = true; return; }
    if (draft.html === serialize()) { clearDraft(); draftbar.hidden = true; return; }
    var when = new Date(draft.time);
    draftText.textContent = 'You have unsaved edits from ' +
      when.toLocaleDateString() + ', ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.';
    draftbar.hidden = false;
  }

  document.getElementById('btn-restore').addEventListener('click', function () {
    var draft = readDraft();
    draftbar.hidden = true;
    if (!draft) return;
    frame.onload = function () {
      setup();
      draftbar.hidden = true;
      markDirty();
      toast('Earlier edits restored.');
    };
    var parsed = new DOMParser().parseFromString(draft.html, 'text/html');
    var base = parsed.createElement('base');
    base.setAttribute('href', SITE_ROOT.href);
    base.setAttribute('data-editor', '');
    parsed.head.insertBefore(base, parsed.head.firstChild);
    frame.srcdoc = '<!doctype html>\n' + parsed.documentElement.outerHTML;
  });

  document.getElementById('btn-discard').addEventListener('click', function () {
    clearDraft();
    draftbar.hidden = true;
    toast('Draft discarded.');
  });

  /* ---------- changes ---------- */
  function markDirty() {
    dirty = true;
    downloaded = false;
    setStatus('Unsaved changes. Download when you’re done.', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (writeDraft(serialize())) setStatus('Draft kept in this browser. Download when you’re done.', true);
    }, 700);
  }

  function onChange() { markDirty(); positionControls(); }

  function onPaste(e) {
    if (!e.target.closest || !e.target.closest('[contenteditable]')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    text = text.replace(/\s*\n\s*/g, ' ');
    doc.execCommand('insertText', false, text);
  }

  function onKeydown(e) {
    var el = e.target.closest && e.target.closest('[contenteditable]');
    if (!el || e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey || el.closest('address')) doc.execCommand('insertLineBreak');
  }

  function onShortcut(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      download();
    }
  }
  window.addEventListener('keydown', onShortcut);

  /* ---------- links ---------- */
  function onClick(e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var href = a.getAttribute('href') || '';
    if (!a.closest('[contenteditable]') && href.charAt(0) === '#') {
      var target = href === '#' ? null : doc.getElementById(href.slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function linkAtSelection() {
    var sel = doc && doc.getSelection();
    if (!sel || !sel.anchorNode) return null;
    var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    var a = node && node.closest('a');
    return a && a.closest('[contenteditable]') ? a : null;
  }

  function updateLinkbar() {
    var a = linkAtSelection();
    if (a === currentLink) return;
    currentLink = a;
    linkbar.hidden = !a;
    document.getElementById('hint').hidden = !!a;
    if (a) linkInput.value = a.getAttribute('href') || '';
  }

  linkInput.addEventListener('input', function () {
    if (!currentLink) return;
    currentLink.setAttribute('href', linkInput.value.trim());
    markDirty();
  });

  document.getElementById('btn-unlink').addEventListener('click', function () {
    if (!currentLink) return;
    var a = currentLink;
    while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
    a.remove();
    currentLink = null;
    linkbar.hidden = true;
    markDirty();
  });

  document.getElementById('btn-addlink').addEventListener('click', function () {
    var sel = doc && doc.getSelection();
    var anchor = sel && sel.anchorNode;
    var inEditable = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement).closest('[contenteditable]');
    if (!sel || sel.isCollapsed || !inEditable) { toast('Select some text on the page first.'); return; }
    var url = prompt('Link address (for example https://… or mailto:…)', 'https://');
    if (!url || url === 'https://') return;
    frame.contentWindow.focus();
    doc.execCommand('createLink', false, url.trim());
    markDirty();
  });

  /* ---------- bold / italic ---------- */
  var cmdButtons = document.querySelectorAll('[data-cmd]');
  for (var c = 0; c < cmdButtons.length; c++) {
    cmdButtons[c].addEventListener('mousedown', function (e) { e.preventDefault(); });
    cmdButtons[c].addEventListener('click', function () {
      if (!doc) return;
      frame.contentWindow.focus();
      doc.execCommand(this.getAttribute('data-cmd'));
      markDirty();
    });
  }

  /* ---------- item controls: move, duplicate, delete ---------- */
  function buildControls() {
    controls = doc.createElement('div');
    controls.className = 'ed-controls';
    controls.setAttribute('data-editor', '');
    controls.hidden = true;
    [['up', '↑', 'Move up'], ['down', '↓', 'Move down'], ['dup', 'Duplicate', 'Add a copy below'], ['del', 'Delete', 'Delete this item']]
      .forEach(function (b) {
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = b[0];
        btn.textContent = b[1];
        btn.title = b[2];
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        btn.addEventListener('click', function (e) { e.stopPropagation(); act(b[0]); });
        controls.appendChild(btn);
      });
    doc.body.appendChild(controls);
  }

  function onHover(e) {
    if (controls.contains(e.target)) return;
    var item = e.target.closest && e.target.closest(REPEATABLE);
    if (item === hoverItem) return;
    hoverItem = item;
    positionControls();
  }

  function positionControls() {
    if (!controls) return;
    if (!hoverItem || !hoverItem.isConnected) { controls.hidden = true; return; }
    controls.hidden = false;
    var r = hoverItem.getBoundingClientRect();
    var win = doc.defaultView;
    var w = controls.offsetWidth;
    var left = Math.max(4, Math.min(r.right - w, win.innerWidth - w - 4)) + win.scrollX;
    var top = Math.max(r.top - controls.offsetHeight - 2, 0) + win.scrollY;
    controls.style.left = left + 'px';
    controls.style.top = top + 'px';
  }

  function sameKind(a, b) {
    return b && b.tagName === a.tagName && b.matches(REPEATABLE);
  }

  function act(kind) {
    var item = hoverItem;
    if (!item) return;
    if (kind === 'up') {
      var prev = item.previousElementSibling;
      if (sameKind(item, prev)) { prev.before(item); flash(item); markDirty(); }
    } else if (kind === 'down') {
      var next = item.nextElementSibling;
      if (sameKind(item, next)) { next.after(item); flash(item); markDirty(); }
    } else if (kind === 'dup') {
      var copy = item.cloneNode(true);
      var ws = item.previousSibling;
      var indent = ws && ws.nodeType === 3 && /^\s+$/.test(ws.nodeValue) ? ws.nodeValue : '\n';
      item.after(copy);
      item.after(doc.createTextNode(indent));
      hoverItem = copy;
      flash(copy);
      var first = copy.matches('[contenteditable]') ? copy : copy.querySelector('[contenteditable]');
      if (first) {
        first.focus();
        var range = doc.createRange();
        range.selectNodeContents(first);
        var sel = doc.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      markDirty();
    } else if (kind === 'del') {
      var siblings = 0;
      var kids = item.parentNode.children;
      for (var i = 0; i < kids.length; i++) if (sameKind(item, kids[i])) siblings++;
      if (siblings <= 1) { toast('This is the last item here. Edit its text instead of deleting it.'); return; }
      var parent = item.parentNode;
      var after = item.nextSibling;
      item.remove();
      hoverItem = null;
      markDirty();
      toast('Item deleted.', 'Undo', function () {
        parent.insertBefore(item, after && after.parentNode === parent ? after : null);
        flash(item);
        markDirty();
      });
    }
    positionControls();
  }

  function flash(el) {
    el.classList.remove('ed-flash');
    void el.offsetWidth;
    el.classList.add('ed-flash');
    setTimeout(function () {
      el.classList.remove('ed-flash');
      if (!el.getAttribute('class')) el.removeAttribute('class');
    }, 1300);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }


  /* ---------- news ---------- */
  document.getElementById('btn-addnews').addEventListener('click', function () {
    if (!doc) return;
    var list = doc.querySelector('.news-list');
    if (!list) { toast('This page has no News list.'); return; }
    var first = list.querySelector('li');
    var li;
    if (first) {
      li = first.cloneNode(true);
    } else {
      li = doc.createElement('li');
      li.innerHTML = '<span class="when"></span><p></p>';
    }
    var when = li.querySelector('.when');
    var text = li.querySelector('p');
    when.textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    text.textContent = 'Write the news here.';
    [when, text].forEach(function (el) {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
    });
    li.classList.remove('ed-flash');
    if (!li.getAttribute('class')) li.removeAttribute('class');

    var ws = first && first.previousSibling;
    var indent = ws && ws.nodeType === 3 && /^\s+$/.test(ws.nodeValue) ? ws.nodeValue : '\n';
    list.insertBefore(li, list.firstElementChild);
    list.insertBefore(doc.createTextNode(indent), li.nextSibling);

    flash(li);
    li.scrollIntoView({ block: 'center' });
    frame.contentWindow.focus();
    text.focus({ preventScroll: true });
    var range = doc.createRange();
    range.selectNodeContents(text);
    var sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    markDirty();
    toast('News item added at the top. Type to replace the text.');
  });

  /* ---------- output ---------- */
  function serialize() {
    if (!doc) return '';
    var root = doc.documentElement.cloneNode(true);
    var junk = root.querySelectorAll('[data-editor]');
    for (var i = 0; i < junk.length; i++) junk[i].remove();
    var eds = root.querySelectorAll('[contenteditable]');
    for (var j = 0; j < eds.length; j++) {
      eds[j].removeAttribute('contenteditable');
      eds[j].removeAttribute('spellcheck');
      if (eds[j].innerHTML === '<br>') eds[j].innerHTML = '';
    }
    // Browsers leave empty style attributes and non-breaking spaces behind while typing.
    var styled = root.querySelectorAll('[style]');
    for (var s = 0; s < styled.length; s++) {
      if (!styled[s].getAttribute('style').trim()) styled[s].removeAttribute('style');
    }
    var main = root.querySelector('body');
    var walker = doc.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      var t = walker.currentNode;
      if (t.nodeValue.indexOf('\u00a0') !== -1) t.nodeValue = t.nodeValue.replace(/\u00a0/g, ' ');
    }
    var flashed = root.querySelectorAll('.ed-flash');
    for (var k = 0; k < flashed.length; k++) {
      flashed[k].classList.remove('ed-flash');
      if (!flashed[k].getAttribute('class')) flashed[k].removeAttribute('class');
    }
    var html = root.outerHTML
      .replace('<html lang="en"><head>', '<html lang="en">\n<head>')
      .replace(/<(circle|line|path|rect)([^>]*)><\/\1>/g, '<$1$2/>')
      .replace(/\s*<\/body><\/html>$/, '\n\n</body>\n</html>');
    return '<!doctype html>\n' + html + '\n';
  }

  function download() {
    if (!doc) return;
    var blob = new Blob([serialize()], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    downloaded = true;
    writeDraft(serialize());
    setStatus('Downloaded. Upload index.html to GitHub to publish.');
    toast('index.html downloaded.', 'How to publish', function () { help.showModal(); });
  }

  btnDownload.addEventListener('click', download);
  document.getElementById('btn-help').addEventListener('click', function () { help.showModal(); });

  /* ---------- opening a file from the computer ---------- */
  btnOpen.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { mount(String(reader.result)); };
    reader.readAsText(f);
    fileInput.value = '';
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty && !downloaded) { e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('resize', positionControls);

  /* ---------- start ---------- */
  loadFromSite()
    .then(mount)
    .catch(function () {
      setStatus('Couldn’t load the page automatically. Use “Open file…” and pick index.html.', true);
      var draft = readDraft();
      if (draft && draft.html) {
        draftText.textContent = 'You have unsaved edits from an earlier session.';
        draftbar.hidden = false;
      }
    });
})();
