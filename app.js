/* ==================== Ayra Core v2 ==================== */
const Ayra = {
  tabs: [],
  activeTabId: null,
  nextTabId: 1,
  nextElementId: 1,

  tool: 'select',
  strokeColor: '#e7e9ea',
  fillColor: '#16181c',
  strokeWidth: 2,

  isDrawing: false,
  isPanning: false,
  isDragging: false,
  isResizing: false,
  startX: 0, startY: 0, lastX: 0, lastY: 0,
  currentPath: null,
  selectedId: null,
  dragOffset: { x: 0, y: 0 },
  tempShape: null,

  quill: null,
  editingNoteId: null,
  pendingNotePos: null,
  pendingChartPos: null,
  pendingTablePos: null,
  pendingMiniappPos: null,

  ctxTargetId: null,
  ctxTabId: null,
  settingsTarget: null,

  canvas: null, ctx: null, elementsLayer: null,

  STORAGE_KEY: 'ayra_workspace_v2',

  init() {
    this.canvas = document.getElementById('main-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.elementsLayer = document.getElementById('elements-layer');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindUI();
    this.bindCanvasEvents();
    this.bindContextMenus();
    this.initQuill();
    this.initMiniappTabs();

    if (!this.loadFromStorage()) {
      this.createTab('بوم ۱');
    }
    this.renderTabs();
    this.syncElementsLayer();
    this.render();

    setInterval(() => this.saveToStorage(), 4000);
    window.addEventListener('beforeunload', () => this.saveToStorage());
  },

  resizeCanvas() {
    const area = document.getElementById('canvas-area');
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = area.clientWidth * dpr;
    this.canvas.height = area.clientHeight * dpr;
    this.canvas.style.width = area.clientWidth + 'px';
    this.canvas.style.height = area.clientHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  },

  /* ========== Storage ========== */
  saveToStorage() {
    try {
      const data = {
        tabs: this.tabs.map(t => ({
          id: t.id,
          title: t.title,
          camera: t.camera,
          elements: t.elements.map(el => {
            const c = { ...el };
            delete c.chartInstance;
            return c;
          }),
          drawings: t.drawings,
          bgColor: t.bgColor || '#000000'
        })),
        activeTabId: this.activeTabId,
        nextTabId: this.nextTabId,
        nextElementId: this.nextElementId
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Save failed', e);
    }
  },

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.tabs || !data.tabs.length) return false;
      this.tabs = data.tabs;
      this.activeTabId = data.activeTabId || this.tabs[0].id;
      this.nextTabId = data.nextTabId || (Math.max(...this.tabs.map(t => t.id)) + 1);
      this.nextElementId = data.nextElementId || 1;
      return true;
    } catch {
      return false;
    }
  },

  /* ========== Tabs ========== */
  createTab(title = null) {
    const id = this.nextTabId++;
    const tab = {
      id,
      title: title || `بوم ${id}`,
      camera: { x: 0, y: 0, zoom: 1 },
      elements: [],
      drawings: [],
      bgColor: '#000000'
    };
    this.tabs.push(tab);
    this.activeTabId = id;
    this.selectedId = null;
    this.renderTabs();
    this.syncElementsLayer();
    this.render();
    this.saveToStorage();
    return tab;
  },

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId);
  },

  switchTab(id) {
    if (id === this.activeTabId) return;
    this.activeTabId = id;
    this.selectedId = null;
    this.renderTabs();
    this.syncElementsLayer();
    this.render();
    this.saveToStorage();
  },

  closeTab(id) {
    if (this.tabs.length === 1) {
      const t = this.tabs[0];
      t.elements = []; t.drawings = [];
      t.camera = { x: 0, y: 0, zoom: 1 };
      t.title = 'بوم ۱';
      this.selectedId = null;
      this.syncElementsLayer();
      this.render();
      this.renderTabs();
      this.saveToStorage();
      return;
    }
    const idx = this.tabs.findIndex(t => t.id === id);
    this.tabs.splice(idx, 1);
    if (this.activeTabId === id) {
      this.activeTabId = this.tabs[Math.max(0, idx - 1)].id;
    }
    this.selectedId = null;
    this.renderTabs();
    this.syncElementsLayer();
    this.render();
    this.saveToStorage();
  },

  renameTab(id) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;
    const name = prompt('نام جدید تب:', tab.title);
    if (name && name.trim()) {
      tab.title = name.trim();
      this.renderTabs();
      this.saveToStorage();
    }
  },

  duplicateTab(id) {
    const src = this.tabs.find(t => t.id === id);
    if (!src) return;
    const newTab = this.createTab(src.title + ' (کپی)');
    newTab.camera = { ...src.camera };
    newTab.drawings = JSON.parse(JSON.stringify(src.drawings));
    newTab.elements = JSON.parse(JSON.stringify(src.elements)).map(el => {
      el.id = this.nextElementId++;
      delete el.chartInstance;
      return el;
    });
    newTab.bgColor = src.bgColor;
    this.syncElementsLayer();
    this.render();
    this.saveToStorage();
  },

  renderTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    this.tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === this.activeTabId ? ' active' : '');
      el.innerHTML = `<span class="tab-title">${this.escape(tab.title)}</span><span class="tab-close">×</span>`;
      el.querySelector('.tab-title').addEventListener('dblclick', () => this.renameTab(tab.id));
      el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); this.closeTab(tab.id); });
      el.addEventListener('click', () => this.switchTab(tab.id));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showTabContextMenu(e, tab.id);
      });
      container.appendChild(el);
    });
  },

  /* ========== UI ========== */
  bindUI() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
        this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair';
      });
    });

    document.getElementById('stroke-color').addEventListener('input', e => this.strokeColor = e.target.value);
    document.getElementById('fill-color').addEventListener('input', e => this.fillColor = e.target.value);
    document.getElementById('stroke-width').addEventListener('input', e => this.strokeWidth = parseInt(e.target.value));

    document.getElementById('new-tab-btn').addEventListener('click', () => this.createTab());
    document.getElementById('delete-btn').addEventListener('click', () => this.deleteSelected());

    document.getElementById('save-ay-btn').addEventListener('click', () => this.saveAY());
    document.getElementById('load-ay-btn').addEventListener('click', () => document.getElementById('ay-file-input').click());
    document.getElementById('ay-file-input').addEventListener('change', e => this.loadAY(e));

    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    });

    document.getElementById('save-note-btn').addEventListener('click', () => this.saveNoteFromModal());
    document.getElementById('create-chart-btn').addEventListener('click', () => this.createChartFromModal());
    document.getElementById('create-table-btn').addEventListener('click', () => this.createTableFromModal());
    document.getElementById('create-miniapp-btn').addEventListener('click', () => this.createMiniappFromModal());
    document.getElementById('apply-settings-btn').addEventListener('click', () => this.applySettings());

    window.addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) &&
          !document.activeElement.isContentEditable) {
        this.deleteSelected();
      }
      if (e.key === 'Escape') {
        this.selectedId = null;
        this.hideContextMenus();
        this.render();
        this.syncElementsLayer();
      }
    });

    document.addEventListener('click', () => this.hideContextMenus());
  },

  initQuill() {
    this.quill = new Quill('#quill-editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ color: [] }, { background: [] }],
          ['link', 'blockquote', 'code-block'],
          ['clean']
        ]
      },
      placeholder: 'هر چی می‌خوای بنویس...'
    });
  },

  initMiniappTabs() {
    document.querySelectorAll('.miniapp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.miniapp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.code-area').forEach(a => a.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('miniapp-' + tab.dataset.panel).classList.add('active');
      });
    });
  },

  /* ========== Context Menus ========== */
  bindContextMenus() {
    document.getElementById('context-menu').addEventListener('click', e => {
      const action = e.target.dataset?.action;
      if (!action || !this.ctxTargetId) return;
      this.handleElementContext(action);
      this.hideContextMenus();
    });

    document.getElementById('tab-context-menu').addEventListener('click', e => {
      const action = e.target.dataset?.action;
      if (!action || this.ctxTabId == null) return;
      this.handleTabContext(action);
      this.hideContextMenus();
    });
  },

  showElementContextMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    this.hideContextMenus();
    this.ctxTargetId = id;
    this.selectedId = id;

    const menu = document.getElementById('context-menu');
    menu.innerHTML = `
      <div class="ctx-item" data-action="edit">ویرایش</div>
      <div class="ctx-item" data-action="duplicate">کپی</div>
      <div class="ctx-item" data-action="bring-front">بیار جلو</div>
      <div class="ctx-item" data-action="send-back">ببر عقب</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="settings">تنظیمات</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item danger" data-action="delete">حذف</div>
    `;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');
    this.syncElementsLayer();
  },

  showTabContextMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    this.hideContextMenus();
    this.ctxTabId = id;

    const menu = document.getElementById('tab-context-menu');
    menu.innerHTML = `
      <div class="ctx-item" data-action="rename">تغییر نام</div>
      <div class="ctx-item" data-action="duplicate-tab">کپی تب</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" data-action="tab-settings">تنظیمات تب</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item danger" data-action="close-tab">بستن تب</div>
    `;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.remove('hidden');
  },

  hideContextMenus() {
    document.getElementById('context-menu').classList.add('hidden');
    document.getElementById('tab-context-menu').classList.add('hidden');
  },

  handleElementContext(action) {
    const tab = this.getActiveTab();
    if (!tab) return;
    const el = tab.elements.find(e => e.id === this.ctxTargetId);
    if (!el) return;

    if (action === 'delete') {
      this.selectedId = this.ctxTargetId;
      this.deleteSelected();
    } else if (action === 'duplicate') {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = this.nextElementId++;
      copy.x += 20; copy.y += 20;
      delete copy.chartInstance;
      tab.elements.push(copy);
      this.syncElementsLayer();
      this.saveToStorage();
    } else if (action === 'bring-front') {
      tab.elements = tab.elements.filter(e => e.id !== el.id);
      tab.elements.push(el);
      this.syncElementsLayer();
      this.saveToStorage();
    } else if (action === 'send-back') {
      tab.elements = tab.elements.filter(e => e.id !== el.id);
      tab.elements.unshift(el);
      this.syncElementsLayer();
      this.saveToStorage();
    } else if (action === 'edit') {
      if (el.type === 'note') this.openNoteModal(el);
      else if (el.type === 'miniapp') this.openMiniappEdit(el);
    } else if (action === 'settings') {
      this.openSettings('element', el.id);
    }
  },

  handleTabContext(action) {
    if (action === 'rename') this.renameTab(this.ctxTabId);
    else if (action === 'duplicate-tab') this.duplicateTab(this.ctxTabId);
    else if (action === 'close-tab') this.closeTab(this.ctxTabId);
    else if (action === 'tab-settings') this.openSettings('tab', this.ctxTabId);
  },

  /* ========== Settings ========== */
  openSettings(type, id) {
    this.settingsTarget = { type, id };
    const body = document.getElementById('settings-body');
    const title = document.getElementById('settings-title');

    if (type === 'element') {
      const tab = this.getActiveTab();
      const el = tab?.elements.find(e => e.id === id);
      if (!el) return;
      title.textContent = 'تنظیمات آیتم';
      body.innerHTML = `
        <div class="form-group"><label>شفافیت (۰ تا ۱)</label>
          <input type="number" id="set-opacity" min="0.1" max="1" step="0.05" value="${el.opacity ?? 1}" /></div>
        <div class="form-group"><label>قفل شده</label>
          <select id="set-locked"><option value="false" ${!el.locked?'selected':''}>خیر</option>
          <option value="true" ${el.locked?'selected':''}>بله</option></select></div>
        <div class="form-group"><label>عرض</label>
          <input type="number" id="set-w" value="${Math.round(el.w)}" /></div>
        <div class="form-group"><label>ارتفاع</label>
          <input type="number" id="set-h" value="${Math.round(el.h)}" /></div>
      `;
    } else if (type === 'tab') {
      const tab = this.tabs.find(t => t.id === id);
      if (!tab) return;
      title.textContent = 'تنظیمات تب';
      body.innerHTML = `
        <div class="form-group"><label>نام تب</label>
          <input type="text" id="set-tab-title" value="${this.escape(tab.title)}" /></div>
        <div class="form-group"><label>رنگ پس‌زمینه بوم</label>
          <input type="color" id="set-bg" value="${tab.bgColor || '#000000'}" /></div>
      `;
    }

    document.getElementById('settings-modal').classList.remove('hidden');
  },

  applySettings() {
    if (!this.settingsTarget) return;
    const { type, id } = this.settingsTarget;

    if (type === 'element') {
      const tab = this.getActiveTab();
      const el = tab?.elements.find(e => e.id === id);
      if (!el) return;
      el.opacity = parseFloat(document.getElementById('set-opacity').value) || 1;
      el.locked = document.getElementById('set-locked').value === 'true';
      el.w = parseFloat(document.getElementById('set-w').value) || el.w;
      el.h = parseFloat(document.getElementById('set-h').value) || el.h;
      this.syncElementsLayer();
    } else if (type === 'tab') {
      const tab = this.tabs.find(t => t.id === id);
      if (!tab) return;
      const newTitle = document.getElementById('set-tab-title').value.trim();
      if (newTitle) tab.title = newTitle;
      tab.bgColor = document.getElementById('set-bg').value;
      this.renderTabs();
      this.render();
    }

    document.getElementById('settings-modal').classList.add('hidden');
    this.saveToStorage();
  },

  /* ========== Canvas Events ========== */
  bindCanvasEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => this.onPointerDown(e));
    c.addEventListener('mousemove', e => this.onPointerMove(e));
    c.addEventListener('mouseup', e => this.onPointerUp(e));
    c.addEventListener('mouseleave', e => this.onPointerUp(e));

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const tab = this.getActiveTab();
      if (!tab) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(5, Math.max(0.15, tab.camera.zoom * zoomFactor));
      const worldX = (mx - tab.camera.x) / tab.camera.zoom;
      const worldY = (my - tab.camera.y) / tab.camera.zoom;
      tab.camera.zoom = newZoom;
      tab.camera.x = mx - worldX * newZoom;
      tab.camera.y = my - worldY * newZoom;
      this.render();
      this.syncElementsLayer();
    }, { passive: false });

    c.addEventListener('dblclick', e => {
      if (this.tool !== 'select' && this.tool !== 'note') return;
      const pos = this.screenToWorld(e.clientX, e.clientY);
      this.openNoteModal(null, pos.x, pos.y);
    });

    c.addEventListener('contextmenu', e => e.preventDefault());
  },

  screenToWorld(clientX, clientY) {
    const tab = this.getActiveTab();
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - tab.camera.x) / tab.camera.zoom,
      y: (sy - tab.camera.y) / tab.camera.zoom
    };
  },

  onPointerDown(e) {
    const tab = this.getActiveTab();
    if (!tab) return;
    const pos = this.screenToWorld(e.clientX, e.clientY);
    this.startX = pos.x; this.startY = pos.y;
    this.lastX = e.clientX; this.lastY = e.clientY;

    if (this.tool === 'pan' || e.button === 1 || (e.button === 0 && e.altKey)) {
      this.isPanning = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.tool === 'select') {
      this.selectedId = null;
      this.syncElementsLayer();
      this.render();
      return;
    }

    if (this.tool === 'draw') {
      this.isDrawing = true;
      this.currentPath = { type: 'path', points: [{ x: pos.x, y: pos.y }], color: this.strokeColor, width: this.strokeWidth };
      return;
    }

    if (['rect','circle','triangle','diamond','hexagon','cube','line'].includes(this.tool)) {
      this.isDrawing = true;
      this.tempShape = {
        type: this.tool, x: pos.x, y: pos.y, w: 0, h: 0,
        color: this.strokeColor, fill: this.fillColor, width: this.strokeWidth
      };
      return;
    }

    if (this.tool === 'note') { this.openNoteModal(null, pos.x, pos.y); return; }
    if (this.tool === 'image') { this.addImageAt(pos.x, pos.y); return; }
    if (this.tool === 'chart') {
      this.pendingChartPos = { x: pos.x, y: pos.y };
      document.getElementById('chart-modal').classList.remove('hidden');
      return;
    }
    if (this.tool === 'table') {
      this.pendingTablePos = { x: pos.x, y: pos.y };
      document.getElementById('table-modal').classList.remove('hidden');
      return;
    }
    if (this.tool === 'miniapp') {
      this.pendingMiniappPos = { x: pos.x, y: pos.y };
      document.getElementById('miniapp-html').value = `<div class="box">سلام دنیا 👋</div>`;
      document.getElementById('miniapp-css').value = `body{margin:0;background:#000;color:#e7e9ea;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}\n.box{padding:20px;border:1px solid #2f3336;border-radius:12px;}`;
      document.getElementById('miniapp-js').value = `console.log('Ayra MiniApp ready');`;
      document.getElementById('miniapp-modal').classList.remove('hidden');
      return;
    }
  },

  onPointerMove(e) {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (this.isPanning) {
      tab.camera.x += e.clientX - this.lastX;
      tab.camera.y += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.render();
      this.syncElementsLayer();
      return;
    }

    if (this.isDrawing && this.currentPath) {
      const pos = this.screenToWorld(e.clientX, e.clientY);
      this.currentPath.points.push({ x: pos.x, y: pos.y });
      this.render();
      return;
    }

    if (this.isDrawing && this.tempShape) {
      const pos = this.screenToWorld(e.clientX, e.clientY);
      this.tempShape.w = pos.x - this.tempShape.x;
      this.tempShape.h = pos.y - this.tempShape.y;
      this.render();
    }
  },

  onPointerUp() {
    const tab = this.getActiveTab();
    if (!tab) return;

    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
    }

    if (this.isDrawing && this.currentPath) {
      if (this.currentPath.points.length > 1) tab.drawings.push(this.currentPath);
      this.currentPath = null;
      this.isDrawing = false;
      this.render();
      this.saveToStorage();
    }

    if (this.isDrawing && this.tempShape) {
      const s = this.tempShape;
      if (s.w < 0) { s.x += s.w; s.w = -s.w; }
      if (s.h < 0) { s.y += s.h; s.h = -s.h; }
      if (s.w > 3 || s.h > 3 || s.type === 'line') tab.drawings.push({ ...s });
      this.tempShape = null;
      this.isDrawing = false;
      this.render();
      this.saveToStorage();
    }
  },

  /* ========== Rendering ========== */
  render() {
    const tab = this.getActiveTab();
    if (!tab) return;
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    ctx.fillStyle = tab.bgColor || '#000000';
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(ctx, tab);

    ctx.save();
    ctx.translate(tab.camera.x, tab.camera.y);
    ctx.scale(tab.camera.zoom, tab.camera.zoom);

    tab.drawings.forEach(d => this.drawItem(ctx, d));
    if (this.currentPath) this.drawItem(ctx, this.currentPath);
    if (this.tempShape) this.drawItem(ctx, this.tempShape);

    ctx.restore();

    const hint = document.querySelector('.empty-hint');
    if (tab.drawings.length === 0 && tab.elements.length === 0) {
      if (!hint) {
        const h = document.createElement('div');
        h.className = 'empty-hint';
        h.innerHTML = `<strong>Ayra</strong>ابزارهای سمت چپ · دابل‌کلیک = نوت جدید`;
        document.getElementById('canvas-area').appendChild(h);
      }
    } else if (hint) hint.remove();
  },

  drawGrid(ctx, tab) {
    const zoom = tab.camera.zoom;
    const size = 40 * zoom;
    if (size < 8) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    const ox = tab.camera.x % size;
    const oy = tab.camera.y % size;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.beginPath();
    for (let x = ox; x < w; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy; y < h; y += size) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.restore();
  },

  drawItem(ctx, item) {
    ctx.strokeStyle = item.color || '#e7e9ea';
    ctx.fillStyle = item.fill || 'transparent';
    ctx.lineWidth = item.width || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.type === 'path') {
      if (item.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) ctx.lineTo(item.points[i].x, item.points[i].y);
      ctx.stroke();
      return;
    }
    if (item.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.w, item.y + item.h);
      ctx.stroke();
      return;
    }

    const { x, y, w, h } = item;
    if (item.type === 'rect') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill(); ctx.stroke();
    } else if (item.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    } else if (item.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(x + w/2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (item.type === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(x + w/2, y); ctx.lineTo(x + w, y + h/2);
      ctx.lineTo(x + w/2, y + h); ctx.lineTo(x, y + h/2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (item.type === 'hexagon') {
      const cx = x + w/2, cy = y + h/2, rx = w/2, ry = h/2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI/3 * i - Math.PI/6;
        const px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (item.type === 'cube') {
      const d = Math.min(w, h) * 0.25;
      ctx.beginPath(); ctx.rect(x, y + d, w - d, h - d); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + d); ctx.lineTo(x + d, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - d, y + d);
      ctx.closePath();
      ctx.fillStyle = this.adjustColor(item.fill || '#16181c', 30); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w - d, y + d); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - d); ctx.lineTo(x + w - d, y + h);
      ctx.closePath();
      ctx.fillStyle = this.adjustColor(item.fill || '#16181c', -25); ctx.fill(); ctx.stroke();
    }
  },

  adjustColor(hex, amount) {
    try {
      let c = hex.replace('#','');
      if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
      const num = parseInt(c, 16);
      let r = Math.min(255, Math.max(0, (num >> 16) + amount));
      let g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
      let b = Math.min(255, Math.max(0, (num & 0xff) + amount));
      return `#${(r<<16|g<<8|b).toString(16).padStart(6,'0')}`;
    } catch { return hex; }
  },

  /* ========== Elements Layer ========== */
  syncElementsLayer() {
    const tab = this.getActiveTab();
    if (!tab) return;
    this.elementsLayer.innerHTML = '';
    this.elementsLayer.style.transform = `translate(${tab.camera.x}px, \( {tab.camera.y}px) scale( \){tab.camera.zoom})`;
    this.elementsLayer.style.transformOrigin = '0 0';

    tab.elements.forEach(el => {
      const node = this.createElementNode(el);
      if (node) this.elementsLayer.appendChild(node);
    });
  },

  createElementNode(el) {
    const div = document.createElement('div');
    div.className = `canvas-element ${el.type}-element` + (el.id === this.selectedId ? ' selected' : '');
    div.style.left = el.x + 'px';
    div.style.top = el.y + 'px';
    div.style.width = el.w + 'px';
    div.style.height = el.h + 'px';
    if (el.opacity != null) div.style.opacity = el.opacity;
    div.dataset.id = el.id;

    div.addEventListener('contextmenu', e => this.showElementContextMenu(e, el.id));

    div.addEventListener('mousedown', e => {
      if (e.target.classList.contains('resize-handle') || el.locked) return;
      e.stopPropagation();
      this.selectedId = el.id;
      this.isDragging = true;
      const pos = this.screenToWorld(e.clientX, e.clientY);
      this.dragOffset = { x: pos.x - el.x, y: pos.y - el.y };

      const onMove = ev => {
        if (!this.isDragging) return;
        const p = this.screenToWorld(ev.clientX, ev.clientY);
        el.x = p.x - this.dragOffset.x;
        el.y = p.y - this.dragOffset.y;
        this.syncElementsLayer();
      };
      const onUp = () => {
        this.isDragging = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        this.saveToStorage();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      this.syncElementsLayer();
    });

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.addEventListener('mousedown', e => {
      if (el.locked) return;
      e.stopPropagation();
      this.isResizing = true;
      this.selectedId = el.id;
      const startW = el.w, startH = el.h, startMX = e.clientX, startMY = e.clientY;
      const zoom = this.getActiveTab().camera.zoom;

      const onMove = ev => {
        el.w = Math.max(80, startW + (ev.clientX - startMX) / zoom);
        el.h = Math.max(50, startH + (ev.clientY - startMY) / zoom);
        this.syncElementsLayer();
        if (el.type === 'chart' && el.chartInstance) el.chartInstance.resize();
      };
      const onUp = () => {
        this.isResizing = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        this.saveToStorage();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    div.appendChild(handle);

    if (el.type === 'note') {
      const content = document.createElement('div');
      content.className = 'note-content';
      content.innerHTML = el.html || '';
      div.appendChild(content);
      div.addEventListener('dblclick', e => { e.stopPropagation(); this.openNoteModal(el); });
    } else if (el.type === 'image') {
      const img = document.createElement('img');
      img.src = el.src;
      img.draggable = false;
      div.appendChild(img);
    } else if (el.type === 'table') {
      const table = document.createElement('table');
      el.data.forEach((row, ri) => {
        const tr = document.createElement('tr');
        row.forEach((cell, ci) => {
          const cellEl = document.createElement(ri === 0 ? 'th' : 'td');
          cellEl.contentEditable = !el.locked;
          cellEl.textContent = cell;
          cellEl.addEventListener('input', () => { el.data[ri][ci] = cellEl.textContent; this.saveToStorage(); });
          cellEl.addEventListener('mousedown', e => e.stopPropagation());
          tr.appendChild(cellEl);
        });
        table.appendChild(tr);
      });
      div.appendChild(table);
    } else if (el.type === 'chart') {
      const canvas = document.createElement('canvas');
      div.appendChild(canvas);
      requestAnimationFrame(() => {
        if (el.chartInstance) { try { el.chartInstance.destroy(); } catch {} }
        const color = el.color || '#1d9bf0';
        el.chartInstance = new Chart(canvas, {
          type: el.chartType || 'bar',
          data: {
            labels: el.labels || [],
            datasets: [{
              label: el.title || 'داده',
              data: el.values || [],
              backgroundColor: this.generateColors(color, (el.labels||[]).length, el.chartType),
              borderColor: color,
              borderWidth: el.chartType === 'line' ? 2 : 1,
              tension: 0.3,
              fill: el.chartType === 'line' ? false : true,
              pointBackgroundColor: color,
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: ['pie','doughnut','polarArea'].includes(el.chartType),
                labels: { color: '#e7e9ea', font: { size: 11 } }
              },
              title: {
                display: !!el.title,
                text: el.title || '',
                color: '#e7e9ea',
                font: { size: 13, weight: '600' }
              }
            },
            scales: ['pie','doughnut','polarArea','radar'].includes(el.chartType) ? {} : {
              x: { ticks: { color: '#71767b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
              y: { ticks: { color: '#71767b' }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
          }
        });
      });
    } else if (el.type === 'miniapp') {
      const bar = document.createElement('div');
      bar.className = 'miniapp-bar';
      bar.innerHTML = `<span>⚡ ${el.title || 'مینی‌اپ'}</span>`;
      div.appendChild(bar);

      const iframe = document.createElement('iframe');
      iframe.sandbox = 'allow-scripts allow-same-origin';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>\( {el.css||''}</style></head><body> \){el.html||''}<script>${el.js||''}<\/script></body></html>`;
      iframe.srcdoc = html;
      div.appendChild(iframe);

      div.addEventListener('dblclick', e => {
        e.stopPropagation();
        this.openMiniappEdit(el);
      });
    }

    return div;
  },

  generateColors(base, count, type) {
    if (['pie','doughnut','polarArea'].includes(type)) {
      const colors = [];
      for (let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        colors.push(`hsla(${hue}, 70%, 55%, 0.75)`);
      }
      return colors;
    }
    return base + 'b3';
  },

  /* ========== Note ========== */
  openNoteModal(existing = null, x = 100, y = 100) {
    this.editingNoteId = existing ? existing.id : null;
    this.pendingNotePos = existing ? null : { x, y };
    if (existing) this.quill.root.innerHTML = existing.html || '';
    else this.quill.setText('');
    document.getElementById('note-modal').classList.remove('hidden');
    setTimeout(() => this.quill.focus(), 80);
  },

  saveNoteFromModal() {
    const html = this.quill.root.innerHTML;
    const tab = this.getActiveTab();
    if (!tab) return;
    if (this.editingNoteId) {
      const el = tab.elements.find(e => e.id === this.editingNoteId);
      if (el) el.html = html;
    } else {
      tab.elements.push({
        id: this.nextElementId++,
        type: 'note',
        x: this.pendingNotePos.x,
        y: this.pendingNotePos.y,
        w: 260, h: 150,
        html
      });
    }
    document.getElementById('note-modal').classList.add('hidden');
    this.syncElementsLayer();
    this.saveToStorage();
  },

  /* ========== Image ========== */
  addImageAt(x, y) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const tab = this.getActiveTab();
        const img = new Image();
        img.onload = () => {
          const maxW = 320;
          const scale = Math.min(1, maxW / img.width);
          tab.elements.push({
            id: this.nextElementId++,
            type: 'image',
            x, y,
            w: img.width * scale,
            h: img.height * scale,
            src: reader.result
          });
          this.syncElementsLayer();
          this.saveToStorage();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  /* ========== Chart ========== */
  createChartFromModal() {
    const type = document.getElementById('chart-type').value;
    const title = document.getElementById('chart-title').value;
    const labels = document.getElementById('chart-labels').value.split(',').map(s => s.trim());
    const values = document.getElementById('chart-values').value.split(',').map(s => parseFloat(s.trim()) || 0);
    const color = document.getElementById('chart-color').value;
    const tab = this.getActiveTab();
    if (!tab || !this.pendingChartPos) return;

    tab.elements.push({
      id: this.nextElementId++,
      type: 'chart',
      x: this.pendingChartPos.x,
      y: this.pendingChartPos.y,
      w: 340, h: 260,
      chartType: type,
      title, labels, values, color
    });

    document.getElementById('chart-modal').classList.add('hidden');
    this.pendingChartPos = null;
    this.syncElementsLayer();
    this.saveToStorage();
  },

  /* ========== Table ========== */
  createTableFromModal() {
    const rows = parseInt(document.getElementById('table-rows').value) || 4;
    const cols = parseInt(document.getElementById('table-cols').value) || 3;
    const tab = this.getActiveTab();
    if (!tab || !this.pendingTablePos) return;

    const data = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(r === 0 ? `ستون ${c+1}` : '');
      data.push(row);
    }

    tab.elements.push({
      id: this.nextElementId++,
      type: 'table',
      x: this.pendingTablePos.x,
      y: this.pendingTablePos.y,
      w: cols * 85,
      h: rows * 34 + 8,
      data
    });

    document.getElementById('table-modal').classList.add('hidden');
    this.pendingTablePos = null;
    this.syncElementsLayer();
    this.saveToStorage();
  },

  /* ========== Mini App ========== */
  createMiniappFromModal() {
    const html = document.getElementById('miniapp-html').value;
    const css = document.getElementById('miniapp-css').value;
    const js = document.getElementById('miniapp-js').value;
    const tab = this.getActiveTab();
    if (!tab || !this.pendingMiniappPos) return;

    tab.elements.push({
      id: this.nextElementId++,
      type: 'miniapp',
      x: this.pendingMiniappPos.x,
      y: this.pendingMiniappPos.y,
      w: 360, h: 280,
      title: 'مینی‌اپ',
      html, css, js
    });

    document.getElementById('miniapp-modal').classList.add('hidden');
    this.pendingMiniappPos = null;
    this.syncElementsLayer();
    this.saveToStorage();
  },

  openMiniappEdit(el) {
    this.pendingMiniappPos = null;
    this._editingMiniappId = el.id;
    document.getElementById('miniapp-html').value = el.html || '';
    document.getElementById('miniapp-css').value = el.css || '';
    document.getElementById('miniapp-js').value = el.js || '';
    document.getElementById('miniapp-modal').classList.remove('hidden');

    const btn = document.getElementById('create-miniapp-btn');
    const oldText = btn.textContent;
    btn.textContent = 'ذخیره تغییرات';
    const handler = () => {
      const tab = this.getActiveTab();
      const target = tab?.elements.find(e => e.id === this._editingMiniappId);
      if (target) {
        target.html = document.getElementById('miniapp-html').value;
        target.css = document.getElementById('miniapp-css').value;
        target.js = document.getElementById('miniapp-js').value;
        this.syncElementsLayer();
        this.saveToStorage();
      }
      document.getElementById('miniapp-modal').classList.add('hidden');
      btn.textContent = oldText;
      btn.removeEventListener('click', handler);
      btn.addEventListener('click', () => this.createMiniappFromModal());
    };
    btn.onclick = null;
    btn.addEventListener('click', handler, { once: true });
  },

  /* ========== Delete ========== */
  deleteSelected() {
    if (!this.selectedId) return;
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.elements = tab.elements.filter(e => e.id !== this.selectedId);
    this.selectedId = null;
    this.syncElementsLayer();
    this.saveToStorage();
  },

  /* ========== Save / Load .ay ========== */
  saveAY() {
    const tab = this.getActiveTab();
    if (!tab) return;
    const cleanElements = tab.elements.map(el => {
      const c = { ...el };
      delete c.chartInstance;
      return c;
    });
    const payload = {
      format: 'ayra',
      version: 2,
      savedAt: new Date().toISOString(),
      tab: {
        title: tab.title,
        camera: tab.camera,
        elements: cleanElements,
        drawings: tab.drawings,
        bgColor: tab.bgColor
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab.title.replace(/[^\w\u0600-\u06FF]+/g, '_') || 'ayra'}.ay`;
    a.click();
    URL.revokeObjectURL(url);
  },

  loadAY(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.format !== 'ayra') { alert('این فایل فرمت Ayra نیست.'); return; }
        const t = data.tab;
        const newTab = this.createTab(t.title || 'وارد شده');
        newTab.camera = t.camera || { x: 0, y: 0, zoom: 1 };
        newTab.elements = t.elements || [];
        newTab.drawings = t.drawings || [];
        newTab.bgColor = t.bgColor || '#000000';
        const maxElId = newTab.elements.reduce((m, el) => Math.max(m, el.id || 0), 0);
        this.nextElementId = Math.max(this.nextElementId, maxElId + 1);
        this.syncElementsLayer();
        this.render();
        this.renderTabs();
        this.saveToStorage();
      } catch (err) {
        alert('خطا در خواندن فایل: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => Ayra.init());
