marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return marked.parse(text || '');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const messagesEl        = document.getElementById('messages');
const inputEl           = document.getElementById('message-input');
const sendBtn           = document.getElementById('send-btn');
const chatListEl        = document.getElementById('chat-list');
const newChatBtn        = document.getElementById('new-chat-btn');
const sidebar           = document.getElementById('sidebar');
const sidebarArea       = document.getElementById('sidebar-area');
const settingsBtn       = document.getElementById('settings-btn');
const sidebarToggle     = document.getElementById('sidebar-toggle');
const floatingNewChat   = document.getElementById('floating-new-chat');
const settingsPanel     = document.getElementById('settings-panel');
const settingsTitlebar  = document.getElementById('settings-titlebar');
const settingsClose     = document.getElementById('settings-close');
const msgWidthSlider    = document.getElementById('msg-width-slider');
const msgWidthValue     = document.getElementById('msg-width-value');
const branchBar         = document.getElementById('branch-bar');
const modelSelect       = document.getElementById('model-select');
const sidebarReadMarker = document.getElementById('sidebar-read-marker');
const floatingModelSelect    = document.getElementById('floating-model-select');
const floatingSettingsBtn    = document.getElementById('floating-settings-btn');
const floatingModelControls  = document.getElementById('floating-model-controls');
const titlebar          = document.getElementById('titlebar');
const titlebarMinimize  = document.getElementById('titlebar-minimize');
const titlebarMaximize  = document.getElementById('titlebar-maximize');
const titlebarClose     = document.getElementById('titlebar-close');
const serverStatusEl    = document.getElementById('server-status');
const contextBarFill    = document.getElementById('context-bar-fill');
const contextBarLabel   = document.getElementById('context-bar-label');
const settingsServerUrl = document.getElementById('settings-server-url');
const settingsServerConnect = document.getElementById('settings-server-connect');
const settingsCtxWindow = document.getElementById('settings-ctx-window');
const settingsSystemPrompt  = document.getElementById('settings-system-prompt');
const settingsTemp      = document.getElementById('settings-temp');
const settingsTempValue = document.getElementById('settings-temp-value');
const settingsMaxTokens = document.getElementById('settings-max-tokens');
const scrollTopBtn      = document.getElementById('scroll-top-btn');
const scrollBottomBtn   = document.getElementById('scroll-bottom-btn');

// ── State ─────────────────────────────────────────────────────────────────────

let MODELS = {};
let currentModel = localStorage.getItem('selectedModel') || null;
let currentContextWindow = parseInt(localStorage.getItem('contextWindow') || '0');
let serverUrl = localStorage.getItem('serverUrl') || 'http://localhost:1234';
let serverOnline = false;
let systemPrompt = localStorage.getItem('systemPrompt') || '';
let currentTemp = parseFloat(localStorage.getItem('temperature') || '0.7');
let currentMaxTokens = parseInt(localStorage.getItem('maxTokens') || '0');
let currentChat = null;
let conversationHistory = [];
let currentChatMeta = [];
let lastSavedCount = 0;
let readMarkerEnabled = localStorage.getItem('readMarkerEnabled') === '1';
let currentBranchSiblings = [];
let autoScrollEnabled = true;
let isProgrammaticScroll = false;
let autoScrollDebounceTimer = null;

// ── Window controls ────────────────────────────────────────────────────────────

titlebarMinimize?.addEventListener('click', () => window.api.windowMinimize());
titlebarMaximize?.addEventListener('click', () => window.api.windowToggleMaximize());
titlebarClose?.addEventListener('click', () => window.api.windowClose());

titlebar?.addEventListener('dblclick', (e) => {
  if (e.target.closest('button')) return;
  window.api.windowToggleMaximize();
});

titlebar?.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.detail > 1 || e.target.closest('button')) return;
  window.api.windowStartDrag();
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  theme = theme || localStorage.getItem('theme') || 'amber';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

applyTheme();

// ── Message width ─────────────────────────────────────────────────────────────

function applyMsgWidth(pct) {
  document.documentElement.style.setProperty('--msg-max-width', pct + '%');
  msgWidthSlider.value = pct;
  msgWidthValue.textContent = pct + '%';
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.value) === pct);
  });
  localStorage.setItem('msgMaxWidth', pct);
}

msgWidthSlider?.addEventListener('input', () => applyMsgWidth(parseInt(msgWidthSlider.value)));
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyMsgWidth(parseInt(btn.dataset.value)));
});

applyMsgWidth(parseInt(localStorage.getItem('msgMaxWidth') || '85'));

// ── Settings inputs init ───────────────────────────────────────────────────────

settingsServerUrl.value = serverUrl;
settingsSystemPrompt.value = systemPrompt;
settingsTemp.value = currentTemp;
settingsTempValue.textContent = currentTemp.toFixed(2);
settingsMaxTokens.value = currentMaxTokens;
if (currentContextWindow > 0) settingsCtxWindow.value = currentContextWindow;

settingsSystemPrompt.addEventListener('change', () => {
  systemPrompt = settingsSystemPrompt.value;
  localStorage.setItem('systemPrompt', systemPrompt);
});

settingsTemp.addEventListener('input', () => {
  currentTemp = parseFloat(settingsTemp.value);
  settingsTempValue.textContent = currentTemp.toFixed(2);
  localStorage.setItem('temperature', currentTemp);
});

settingsMaxTokens.addEventListener('change', () => {
  currentMaxTokens = parseInt(settingsMaxTokens.value) || 0;
  localStorage.setItem('maxTokens', currentMaxTokens);
});

settingsCtxWindow.addEventListener('change', () => {
  const val = parseInt(settingsCtxWindow.value) || 0;
  currentContextWindow = val;
  if (val > 0) localStorage.setItem('contextWindow', val);
  else localStorage.removeItem('contextWindow');
  updateContextBar();
});

settingsServerConnect.addEventListener('click', () => {
  const url = settingsServerUrl.value.trim();
  if (!url) return;
  serverUrl = url;
  localStorage.setItem('serverUrl', serverUrl);
  window.api.setServerUrl(serverUrl).catch(() => {});
  loadModels(true);
});

// ── Read marker toggle ─────────────────────────────────────────────────────────

const settingsReadMarkerToggle = document.getElementById('settings-read-marker');
if (settingsReadMarkerToggle) {
  settingsReadMarkerToggle.checked = readMarkerEnabled;
  settingsReadMarkerToggle.addEventListener('change', () => {
    readMarkerEnabled = settingsReadMarkerToggle.checked;
    localStorage.setItem('readMarkerEnabled', readMarkerEnabled ? '1' : '0');
    if (!readMarkerEnabled) removeReadMarker();
  });
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function showConfirmDialog(message, onConfirm) {
  const existing = document.getElementById('confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const msg = document.createElement('p');
  msg.textContent = message;

  const btnRow = document.createElement('div');
  btnRow.className = 'confirm-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-ok';
  confirmBtn.textContent = 'Delete';
  confirmBtn.addEventListener('click', () => { overlay.remove(); onConfirm(); });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  dialog.appendChild(msg);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  cancelBtn.focus();
}

// ── Utility ────────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getDisplayText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
  }
  return '';
}

function getChatMonth(chat) {
  const created = chat?.created || new Date().toISOString();
  if (/^\d{4}-\d{2}/.test(created)) return `${created.slice(0, 4)}/${created.slice(5, 7)}`;
  return 'unknown';
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 3.5);
}

function estimateConversationTokens() {
  let total = 0;
  if (systemPrompt) total += estimateTokens(systemPrompt) + 4;
  for (const msg of conversationHistory) {
    total += estimateTokens(getDisplayText(msg)) + 4;
  }
  return total;
}

function getModelContextWindow() {
  if (currentContextWindow > 0) return currentContextWindow;
  if (currentModel && MODELS[currentModel]) {
    const ctx = MODELS[currentModel].contextLength;
    if (ctx > 0) return ctx;
  }
  return 0;
}

// ── Context bar ────────────────────────────────────────────────────────────────

function updateContextBar() {
  const ctx = getModelContextWindow();
  const tokens = estimateConversationTokens();
  const modelLabel = currentModel
    ? (currentModel.split('/').pop() || currentModel).slice(0, 40)
    : '—';

  if (ctx <= 0) {
    contextBarLabel.textContent = `◈ ${modelLabel}  ·  ~${tokens.toLocaleString()} tokens`;
    contextBarFill.style.width = '0%';
    contextBarFill.classList.remove('warn');
    return;
  }

  const pct = Math.min(100, Math.round((tokens / ctx) * 100));
  const warn = pct >= 75;
  contextBarFill.style.width = pct + '%';
  contextBarFill.classList.toggle('warn', warn);
  contextBarLabel.textContent =
    `◈ ${modelLabel}  ·  ~${tokens.toLocaleString()} / ${ctx.toLocaleString()} tokens  ·  ${pct}%`;
}

// ── Server status ──────────────────────────────────────────────────────────────

async function checkServerStatus() {
  try {
    const result = await window.api.getModels(serverUrl);
    const isOnline = result && Array.isArray(result.models);
    setServerStatus(isOnline ? 'online' : 'offline');
  } catch {
    setServerStatus('offline');
  }
}

function setServerStatus(status) {
  serverOnline = status === 'online';
  if (!serverStatusEl) return;
  serverStatusEl.className = `server-status ${status}`;
  const labels = { online: 'Server online', offline: 'Server offline', unknown: 'Server status unknown' };
  serverStatusEl.title = labels[status] || labels.unknown;
}

// ── Model loading ──────────────────────────────────────────────────────────────

async function loadModels(forceCheck = false) {
  try {
    setServerStatus('unknown');
    const result = await window.api.getModels(serverUrl);
    if (!result || !Array.isArray(result.models)) {
      setServerStatus('offline');
      populateModelSelects([]);
      return;
    }
    setServerStatus('online');
    MODELS = {};
    for (const m of result.models) {
      MODELS[m.id] = { contextLength: m.contextLength || 0 };
    }
    populateModelSelects(result.models);

    // Restore or pick model
    if (currentModel && MODELS[currentModel]) {
      applySelectedModel(currentModel, false);
    } else if (result.models.length > 0) {
      applySelectedModel(result.models[0].id, true);
    }
    updateContextBar();
  } catch {
    setServerStatus('offline');
    populateModelSelects([]);
  }
}

function populateModelSelects(models) {
  const selects = [modelSelect, floatingModelSelect].filter(Boolean);
  for (const sel of selects) {
    sel.innerHTML = '';
    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No models — start LM Studio';
      sel.appendChild(opt);
    } else {
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id.split('/').pop() || m.id;
        sel.appendChild(opt);
      }
    }
  }
  if (currentModel) {
    for (const sel of selects) sel.value = currentModel;
  }
}

function applySelectedModel(modelId, persist = true) {
  currentModel = modelId;
  [modelSelect, floatingModelSelect].forEach(sel => {
    if (sel) sel.value = modelId;
  });
  if (persist) localStorage.setItem('selectedModel', modelId);
  if (currentChat) currentChat.model = modelId;
  // Update context window from model metadata if not manually overridden
  if (!localStorage.getItem('contextWindow') && MODELS[modelId]) {
    currentContextWindow = MODELS[modelId].contextLength || 0;
  }
  updateContextBar();
}

modelSelect?.addEventListener('change', () => applySelectedModel(modelSelect.value));
floatingModelSelect?.addEventListener('change', () => applySelectedModel(floatingModelSelect.value));

// ── Settings panel ─────────────────────────────────────────────────────────────

let settingsDragOffset = null;
let settingsJustClosed = false;

settingsBtn?.addEventListener('click', toggleSettings);
floatingSettingsBtn?.addEventListener('click', toggleSettings);
settingsClose?.addEventListener('click', closeSettings);

function toggleSettings() {
  settingsPanel.classList.toggle('hidden');
  if (!settingsPanel.classList.contains('hidden')) {
    // Refresh server URL field
    settingsServerUrl.value = serverUrl;
  }
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
  settingsJustClosed = true;
  setTimeout(() => { settingsJustClosed = false; }, 100);
}

settingsTitlebar?.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) return;
  settingsDragOffset = {
    x: e.clientX - settingsPanel.offsetLeft,
    y: e.clientY - settingsPanel.offsetTop,
  };

  const onMove = (ev) => {
    settingsPanel.style.left = Math.max(0, ev.clientX - settingsDragOffset.x) + 'px';
    settingsPanel.style.top = Math.max(0, ev.clientY - settingsDragOffset.y) + 'px';
  };

  const onUp = () => {
    settingsDragOffset = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

document.getElementById('settings-hidden-chats')?.addEventListener('click', openHiddenChats);
document.getElementById('settings-dev-console')?.addEventListener('click', () => {
  closeSettings();
  devConsoleEl.classList.toggle('hidden');
  if (!devConsoleEl.classList.contains('hidden')) refreshDevConsoleInfo();
});

// ── Sidebar ────────────────────────────────────────────────────────────────────

let sidebarVisible = localStorage.getItem('sidebarVisible') !== '0';
applySidebarState(sidebarVisible, false);

sidebarToggle?.addEventListener('click', () => {
  sidebarVisible = !sidebarVisible;
  applySidebarState(sidebarVisible, true);
  localStorage.setItem('sidebarVisible', sidebarVisible ? '1' : '0');
});

function applySidebarState(visible, animate) {
  if (!animate) {
    sidebarArea.style.transition = 'none';
    requestAnimationFrame(() => { sidebarArea.style.transition = ''; });
  }
  sidebarArea.classList.toggle('collapsed', !visible);
  sidebar.classList.toggle('hidden', !visible);
  floatingNewChat.classList.toggle('hidden', visible);
  floatingSettingsBtn.classList.toggle('hidden', visible);
  floatingModelControls.classList.toggle('hidden', visible);
}

newChatBtn?.addEventListener('click', startNewChat);
floatingNewChat?.addEventListener('click', startNewChat);

// ── Read marker ────────────────────────────────────────────────────────────────

let readMarkerEl = null;
let readMarkerScrollY = 0;

function removeReadMarker() {
  if (readMarkerEl) { readMarkerEl.remove(); readMarkerEl = null; }
  sidebarReadMarker.classList.add('hidden');
}

function placeReadMarker(x, y) {
  removeReadMarker();
  const marker = document.createElement('div');
  marker.className = 'read-marker';
  const containerRect = messagesEl.getBoundingClientRect();
  readMarkerScrollY = y - containerRect.top + messagesEl.scrollTop;
  marker.style.left = Math.max(5, Math.min(x, window.innerWidth - 5)) + 'px';
  marker.style.top = y + 'px';
  document.body.appendChild(marker);
  readMarkerEl = marker;
  sidebarReadMarker.classList.remove('hidden');
}

function restoreReadMarker(savedX, savedScrollY) {
  removeReadMarker();
  if (savedScrollY > messagesEl.scrollHeight) return;
  const marker = document.createElement('div');
  marker.className = 'read-marker';
  readMarkerScrollY = savedScrollY;
  marker.style.left = savedX;
  const containerRect = messagesEl.getBoundingClientRect();
  marker.style.top = (containerRect.top + savedScrollY - messagesEl.scrollTop) + 'px';
  document.body.appendChild(marker);
  readMarkerEl = marker;
  sidebarReadMarker.classList.remove('hidden');
  updateReadMarkerPosition();
}

function updateReadMarkerPosition() {
  if (!readMarkerEl) return;
  const containerRect = messagesEl.getBoundingClientRect();
  const visualY = containerRect.top + readMarkerScrollY - messagesEl.scrollTop;
  if (visualY < containerRect.top - 5 || visualY > containerRect.bottom + 5) {
    readMarkerEl.style.display = 'none';
  } else {
    readMarkerEl.style.display = '';
  }
  readMarkerEl.style.top = visualY + 'px';
}

messagesEl.addEventListener('scroll', () => {
  updateReadMarkerPosition();
  if (!document.body.classList.contains('streaming') || isProgrammaticScroll) return;

  autoScrollEnabled = false;
  clearTimeout(autoScrollDebounceTimer);
  autoScrollDebounceTimer = setTimeout(() => {
    const dist = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (dist < 350) autoScrollEnabled = true;
  }, 500);
});
window.addEventListener('resize', updateReadMarkerPosition);

scrollTopBtn?.addEventListener('click', () => { messagesEl.scrollTop = 0; });
scrollBottomBtn?.addEventListener('click', () => {
  autoScrollEnabled = true;
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

// ── Message rendering ──────────────────────────────────────────────────────────

let hadSelectionOnMousedown = false;
let contextMenuJustClosed = false;

messagesEl.addEventListener('mousedown', () => {
  const sel = window.getSelection();
  hadSelectionOnMousedown = sel && sel.toString().length > 0;
});

messagesEl.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href');
    if (href && href.startsWith('http')) window.api.openExternal(href);
    return;
  }

  const resendBtn = e.target.closest('.msg-resend-btn');
  if (resendBtn) {
    const msgDiv = resendBtn.closest('.message');
    const msgIndex = msgDiv ? parseInt(msgDiv.dataset.msgIndex) : NaN;
    resendMessage(msgDiv, msgIndex);
    return;
  }

  const editBtn = e.target.closest('.msg-edit-btn');
  if (editBtn) {
    const msgDiv = editBtn.closest('.message');
    if (msgDiv && msgDiv.dataset.msgIndex != null) {
      startEditMessage(msgDiv, parseInt(msgDiv.dataset.msgIndex));
    }
    return;
  }

  if (e.target.closest('a, button, textarea, input, select, .message.editing')) return;

  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return;
  if (hadSelectionOnMousedown) { hadSelectionOnMousedown = false; return; }
  if (contextMenuJustClosed) { contextMenuJustClosed = false; return; }
  if (settingsJustClosed) { settingsJustClosed = false; return; }

  if (readMarkerEnabled) placeReadMarker(e.clientX, e.clientY);
});

function addMessage(role, content, msgIndex) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  if (typeof msgIndex === 'number') div.dataset.msgIndex = msgIndex;

  if (role === 'assistant') {
    div.innerHTML = renderMarkdown(content);
  } else {
    div.textContent = content;
  }

  if (role === 'user' && typeof msgIndex === 'number') {
    const resendBtn = document.createElement('button');
    resendBtn.className = 'msg-resend-btn';
    resendBtn.title = 'Resend message';
    resendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>';
    div.appendChild(resendBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'msg-edit-btn';
    editBtn.title = 'Edit message';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    div.appendChild(editBtn);
  }

  messagesEl.appendChild(div);
  return div;
}

function renderMessage(msg, index) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;
  div.dataset.msgIndex = index;

  const text = getDisplayText(msg);
  if (msg.role === 'assistant') {
    div.innerHTML = renderMarkdown(text);
  } else {
    div.textContent = text;
  }

  if (msg.role === 'user') {
    const resendBtn = document.createElement('button');
    resendBtn.className = 'msg-resend-btn';
    resendBtn.title = 'Resend message';
    resendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>';
    div.appendChild(resendBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'msg-edit-btn';
    editBtn.title = 'Edit message';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    div.appendChild(editBtn);
  }

  return div;
}

// ── Thinking indicator ─────────────────────────────────────────────────────────

function formatThinkingElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatThoughtDuration(seconds) {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} ${m === 1 ? 'minute' : 'minutes'} ${s} ${s === 1 ? 'second' : 'seconds'}`;
}

function createThinkingIndicator() {
  const div = document.createElement('div');
  div.className = 'message thinking';
  div.setAttribute('role', 'status');
  div.setAttribute('aria-live', 'polite');

  const spinner = document.createElement('span');
  spinner.className = 'thinking-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'thinking-label';
  label.textContent = 'Generating';

  const sep = document.createElement('span');
  sep.className = 'thinking-separator';
  sep.textContent = '·';

  const counter = document.createElement('span');
  counter.className = 'thinking-counter';

  const startedAt = Date.now();
  let timerId = null;

  function updateCounter() {
    counter.textContent = formatThinkingElapsed(Math.floor((Date.now() - startedAt) / 1000));
  }

  updateCounter();
  timerId = window.setInterval(updateCounter, 1000);

  div.appendChild(spinner);
  div.appendChild(label);
  div.appendChild(sep);
  div.appendChild(counter);
  messagesEl.appendChild(div);

  return {
    element: div,
    remove() {
      window.clearInterval(timerId);
      div.remove();
    },
    getElapsedSeconds() {
      return Math.floor((Date.now() - startedAt) / 1000);
    }
  };
}

// ── Edit messages ──────────────────────────────────────────────────────────────

function startEditMessage(msgDiv, msgIndex) {
  if (document.body.classList.contains('streaming')) return;
  msgDiv.classList.add('editing');

  const originalText = getDisplayText(conversationHistory[msgIndex]);
  msgDiv.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'edit-close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', cancelEditMessage);

  const textarea = document.createElement('textarea');
  textarea.className = 'edit-textarea';
  textarea.value = originalText;

  const btns = document.createElement('div');
  btns.className = 'edit-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', cancelEditMessage);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-submit-btn';
  saveBtn.textContent = 'Send';
  saveBtn.addEventListener('click', () => submitEditMessage(msgIndex, textarea.value));

  function cancelEditMessage() {
    msgDiv.classList.remove('editing');
    msgDiv.innerHTML = '';
    msgDiv.textContent = originalText;

    const resendBtn = document.createElement('button');
    resendBtn.className = 'msg-resend-btn';
    resendBtn.title = 'Resend message';
    resendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>';
    msgDiv.appendChild(resendBtn);

    const editBtnNew = document.createElement('button');
    editBtnNew.className = 'msg-edit-btn';
    editBtnNew.title = 'Edit message';
    editBtnNew.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    msgDiv.appendChild(editBtnNew);
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitEditMessage(msgIndex, textarea.value);
    }
    if (e.key === 'Escape') cancelEditMessage();
  });

  btns.appendChild(cancelBtn);
  btns.appendChild(saveBtn);
  msgDiv.appendChild(closeBtn);
  msgDiv.appendChild(textarea);
  msgDiv.appendChild(btns);
  textarea.focus();
  textarea.selectionStart = textarea.value.length;
}

async function submitEditMessage(msgIndex, newText) {
  newText = newText.trim();
  if (!newText) return;

  const truncatedHistory = conversationHistory.slice(0, msgIndex);
  const groupId = currentChat?.branchGroup || generateId();

  // Fork to a new chat
  const branchId = generateId();
  const branchChat = {
    id: branchId,
    title: currentChat?.title || 'Chat',
    created: new Date().toISOString(),
    model: currentModel || '',
    branchGroup: groupId,
    messages: [...truncatedHistory, { role: 'user', content: newText }]
  };

  // Ensure original chat has the branchGroup
  if (currentChat && !currentChat.branchGroup) {
    currentChat.branchGroup = groupId;
    await window.api.setBranchGroup(currentChat.id, groupId).catch(() => {});
  }

  // Save branch
  const result = await window.api.saveChat(branchChat, 0);
  if (result?.newId) branchChat.id = result.newId;

  await loadChatById(branchChat.id);
  await streamAssistantResponse();
}

function resendMessage(msgDiv, msgIndex) {
  if (document.body.classList.contains('streaming')) return;
  if (!msgDiv || isNaN(msgIndex)) return;

  conversationHistory.splice(msgIndex + 1);
  while (msgDiv.nextElementSibling) msgDiv.nextElementSibling.remove();

  streamAssistantResponse();
}

// ── Chat persistence ───────────────────────────────────────────────────────────

async function saveCurrentChat() {
  if (!currentChat) return;
  currentChat.model = currentModel || '';
  const result = await window.api.saveChat(currentChat, lastSavedCount);
  if (result?.newId) currentChat.id = result.newId;
  lastSavedCount = result?.savedCount || conversationHistory.length;
}

async function loadChats() {
  const chats = await window.api.listChats().catch(() => []);
  chatListEl.innerHTML = '';
  if (!chats || chats.length === 0) return;

  for (const chat of chats) {
    chatListEl.appendChild(createChatItem(chat));
  }
}

function createChatItem(chat) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.chatId = chat.id;

  const titleEl = document.createElement('span');
  titleEl.className = 'chat-item-title';
  titleEl.textContent = chat.title || 'Untitled';

  const actions = document.createElement('div');
  actions.className = 'chat-item-actions';

  const renameBtn = document.createElement('button');
  renameBtn.className = 'chat-item-rename';
  renameBtn.title = 'Rename';
  renameBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  renameBtn.addEventListener('click', (e) => { e.stopPropagation(); startRenameChat(item, chat.id, titleEl); });

  const privateBtn = document.createElement('button');
  privateBtn.className = 'chat-item-private';
  privateBtn.title = 'Hide chat';
  privateBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  privateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.makePrivate(chat.id);
    item.remove();
    if (currentChat?.id === chat.id) startNewChat();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'chat-item-delete';
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirmDialog(`Delete "${chat.title || 'this chat'}"?`, async () => {
      await window.api.deleteChat(chat.id);
      item.remove();
      if (currentChat?.id === chat.id) startNewChat();
    });
  });

  actions.appendChild(renameBtn);
  actions.appendChild(privateBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(titleEl);
  item.appendChild(actions);

  item.addEventListener('click', () => loadChatById(chat.id));
  return item;
}

function startRenameChat(item, chatId, titleEl) {
  const currentTitle = titleEl.textContent;
  const input = document.createElement('input');
  input.className = 'chat-rename-input';
  input.type = 'text';
  input.value = currentTitle;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  async function commit() {
    const newTitle = input.value.trim() || currentTitle;
    await window.api.renameChat(chatId, newTitle);
    input.replaceWith(titleEl);
    titleEl.textContent = newTitle;
    if (currentChat?.id === chatId) currentChat.title = newTitle;
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
  });
}

function setActiveChatItem(chatId) {
  document.querySelectorAll('.chat-item').forEach(item => {
    item.classList.toggle('active', item.dataset.chatId === chatId);
  });
}

// ── Branch bar ─────────────────────────────────────────────────────────────────

async function renderBranchBar() {
  branchBar.innerHTML = '';
  if (!currentChat?.branchGroup) return;

  const siblings = await window.api.listBranchSiblings(currentChat.branchGroup).catch(() => []);
  currentBranchSiblings = siblings || [];

  if (currentBranchSiblings.length <= 1) return;

  currentBranchSiblings.forEach((sibling, idx) => {
    const tab = document.createElement('button');
    tab.className = 'branch-tab';
    if (sibling.id === currentChat.id) tab.classList.add('active');
    tab.textContent = `v${idx + 1}`;
    tab.title = sibling.title || `Branch ${idx + 1}`;
    tab.addEventListener('click', () => loadChatById(sibling.id));
    branchBar.appendChild(tab);
  });
}

// ── Chat loading ───────────────────────────────────────────────────────────────

async function loadChatById(chatId) {
  if (document.body.classList.contains('streaming')) return;
  const chat = await window.api.loadChat(chatId).catch(() => null);
  if (!chat) return;

  currentChat = chat;
  conversationHistory = (chat.messages || []).map(m => ({ role: m.role, content: m.content }));
  lastSavedCount = conversationHistory.length;

  messagesEl.innerHTML = '';
  conversationHistory.forEach((msg, i) => {
    const div = renderMessage(msg, i);
    messagesEl.appendChild(div);
  });
  markLatestUnanswered();
  messagesEl.scrollTop = messagesEl.scrollHeight;

  setActiveChatItem(chatId);
  removeReadMarker();
  renderBranchBar();

  currentChatMeta = await window.api.loadChatMeta(chatId).catch(() => []);

  if (chat.model && MODELS[chat.model]) {
    applySelectedModel(chat.model, false);
  } else if (currentModel) {
    applySelectedModel(currentModel, false);
  }
  updateContextBar();
}

function startNewChat() {
  if (document.body.classList.contains('streaming')) return;
  currentChat = {
    id: generateId(),
    title: '',
    created: new Date().toISOString(),
    model: currentModel || '',
    branchGroup: '',
    messages: []
  };
  conversationHistory = [];
  lastSavedCount = 0;
  currentChatMeta = [];
  currentBranchSiblings = [];
  messagesEl.innerHTML = '';
  branchBar.innerHTML = '';
  removeReadMarker();
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  inputEl.focus();
  updateContextBar();
}

// ── Sending messages ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || document.body.classList.contains('streaming')) return;
  if (!currentModel) {
    addMessage('error', 'No model selected. Start LM Studio and load a model first.');
    return;
  }

  inputEl.value = '';
  autoResizeTextarea();

  const userMsg = { role: 'user', content: text };
  conversationHistory.push(userMsg);

  const userIdx = conversationHistory.length - 1;
  const userDiv = addMessage('user', text, userIdx);
  markLatestUnanswered(userDiv);
  // Auto-title on first message
  if (!currentChat.title) {
    currentChat.title = text.slice(0, 60);
  }
  currentChat.messages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
  await saveCurrentChat();
  await addChatToSidebar();

  await streamAssistantResponse();
}

async function streamAssistantResponse() {
  const distToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
  if (distToBottom < 350) autoScrollEnabled = true;
  document.body.classList.add('streaming');
  sendBtn.textContent = 'Stop';

  const thinkingIndicator = createThinkingIndicator();

  let streamedText = '';
  let assistantDiv = null;
  let rafPending = false;

  function renderStreamedMarkdown() {
    rafPending = false;
    if (!assistantDiv) return;
    assistantDiv.innerHTML = renderMarkdown(streamedText);
    if (autoScrollEnabled) {
      const msgRect = messagesEl.getBoundingClientRect();
      const divRect = assistantDiv.getBoundingClientRect();
      const contentBottom = divRect.bottom - msgRect.top + messagesEl.scrollTop;
      const visibleBottom = messagesEl.scrollTop + messagesEl.clientHeight;
      if (contentBottom > visibleBottom) {
        isProgrammaticScroll = true;
        messagesEl.scrollTop = contentBottom - messagesEl.clientHeight + 200;
        isProgrammaticScroll = false;
      }
    }
  }

  const options = {
    model: currentModel,
    systemPrompt: systemPrompt || undefined,
    temperature: currentTemp,
    maxTokens: currentMaxTokens > 0 ? currentMaxTokens : undefined,
  };

  const result = await window.api.sendMessage(
    conversationHistory.map(m => ({ role: m.role, content: m.content })),
    options,
    (chunk) => {
      if (!assistantDiv) {
        thinkingIndicator.remove();
        assistantDiv = document.createElement('div');
        assistantDiv.className = 'message assistant';
        messagesEl.appendChild(assistantDiv);
      }
      streamedText += chunk;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(renderStreamedMarkdown);
      }
    }
  );

  thinkingIndicator.remove();
  document.body.classList.remove('streaming');
  sendBtn.textContent = 'Send';

  if (result?.error) {
    if (assistantDiv) assistantDiv.remove();
    addMessage('error', `Error: ${result.error}`);
    await recordMeta('error', result.error, 0);
  } else if (result?.cancelled) {
    if (!streamedText && assistantDiv) assistantDiv.remove();
  } else {
    const finalText = streamedText || result?.content || '';
    if (assistantDiv) {
      assistantDiv.innerHTML = renderMarkdown(finalText);
    } else if (finalText) {
      assistantDiv = addMessage('assistant', finalText);
    }

    if (finalText) {
      const assistantMsg = { role: 'assistant', content: finalText };
      conversationHistory.push(assistantMsg);
      currentChat.messages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
      await saveCurrentChat();
      await recordMeta('success', '', thinkingIndicator.getElapsedSeconds ? 0 : 0);
      updateContextBar();
    }
  }

  markLatestUnanswered();
}

function markLatestUnanswered(specificDiv) {
  document.querySelectorAll('.message.user.latest-unanswered')
    .forEach(el => el.classList.remove('latest-unanswered'));

  const lastUserIdx = conversationHistory.map(m => m.role).lastIndexOf('user');
  const lastAssistantIdx = conversationHistory.map(m => m.role).lastIndexOf('assistant');

  if (lastUserIdx > lastAssistantIdx) {
    const userDivs = messagesEl.querySelectorAll('.message.user');
    if (userDivs.length) userDivs[userDivs.length - 1].classList.add('latest-unanswered');
  }
}

async function recordMeta(status, errorMsg, durationSeconds) {
  if (!currentChat) return;
  const entry = {
    chatId: currentChat.id,
    createdAt: new Date().toISOString(),
    model: currentModel || '',
    status,
    durationSeconds,
    errorMsg: errorMsg || undefined,
    assistantMessageIndex: conversationHistory.filter(m => m.role === 'assistant').length - 1,
    version: 1
  };
  await window.api.recordChatMeta(entry).catch(() => {});
}

async function addChatToSidebar() {
  if (!currentChat) return;
  const existing = chatListEl.querySelector(`[data-chat-id="${currentChat.id}"]`);
  if (!existing) {
    const item = createChatItem(currentChat);
    chatListEl.insertBefore(item, chatListEl.firstChild);
  } else {
    const titleEl = existing.querySelector('.chat-item-title');
    if (titleEl) titleEl.textContent = currentChat.title || 'Untitled';
  }
  setActiveChatItem(currentChat.id);
}

// ── Input handling ─────────────────────────────────────────────────────────────

function autoResizeTextarea() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
}

inputEl.addEventListener('input', autoResizeTextarea);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (document.body.classList.contains('streaming')) return;
    sendMessage();
  }
});

sendBtn.addEventListener('click', () => {
  if (document.body.classList.contains('streaming')) {
    window.api.cancelMessage();
    sendBtn.textContent = 'Stopping…';
  } else {
    sendMessage();
  }
});

// ── Hidden chats ───────────────────────────────────────────────────────────────

async function openHiddenChats() {
  const chats = await window.api.listPrivateChats().catch(() => []);
  const existing = document.getElementById('unhide-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'unhide-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'unhide-dialog';

  const closeX = document.createElement('button');
  closeX.className = 'unhide-x-close';
  closeX.textContent = '×';
  closeX.addEventListener('click', () => overlay.remove());

  const title = document.createElement('h3');
  title.textContent = 'Hidden Chats';

  const list = document.createElement('div');
  list.className = 'unhide-list';

  if (!chats.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--text-muted); font-size: 13px; padding: 8px 0;';
    empty.textContent = 'No hidden chats.';
    list.appendChild(empty);
  } else {
    for (const chat of chats) {
      const item = document.createElement('div');
      item.className = 'unhide-item';

      const titleEl = document.createElement('span');
      titleEl.className = 'unhide-item-title';
      titleEl.textContent = chat.title || 'Untitled';

      const openBtn = document.createElement('button');
      openBtn.className = 'unhide-item-open';
      openBtn.textContent = 'Unhide';
      openBtn.addEventListener('click', async () => {
        await window.api.unhideChat(chat.id);
        overlay.remove();
        await loadChats();
        await loadChatById(chat.id);
      });

      item.appendChild(titleEl);
      item.appendChild(openBtn);
      list.appendChild(item);
    }
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'unhide-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => overlay.remove());

  dialog.appendChild(closeX);
  dialog.appendChild(title);
  dialog.appendChild(list);
  dialog.appendChild(closeBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

// ── In-chat search ─────────────────────────────────────────────────────────────

let searchMatches = [];
let searchCurrentIdx = -1;
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const searchCount = document.getElementById('search-count');
const searchPrev = document.getElementById('search-prev');
const searchNext = document.getElementById('search-next');
const searchClose = document.getElementById('search-close');

function openSearch() {
  searchBar.classList.remove('hidden');
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  searchBar.classList.add('hidden');
  clearSearchHighlights();
  searchMatches = [];
  searchCurrentIdx = -1;
  searchCount.textContent = '';
}

function clearSearchHighlights() {
  messagesEl.querySelectorAll('.search-highlight').forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function runSearch(query) {
  clearSearchHighlights();
  searchMatches = [];
  searchCurrentIdx = -1;
  if (!query) { searchCount.textContent = ''; return; }

  const lower = query.toLowerCase();
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const lowerText = text.toLowerCase();
      let idx = lowerText.indexOf(lower);
      if (idx === -1) return;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      while (idx !== -1) {
        if (idx > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        const span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(span);
        searchMatches.push(span);
        lastIdx = idx + query.length;
        idx = lowerText.indexOf(lower, lastIdx);
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
      [...node.childNodes].forEach(walk);
    }
  };

  messagesEl.querySelectorAll('.message').forEach(walk);
  searchCount.textContent = searchMatches.length ? `1 / ${searchMatches.length}` : 'No results';
  if (searchMatches.length) navigateSearch(0);
}

function navigateSearch(idx) {
  if (!searchMatches.length) return;
  if (searchCurrentIdx >= 0 && searchCurrentIdx < searchMatches.length) {
    searchMatches[searchCurrentIdx].classList.remove('current');
  }
  searchCurrentIdx = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
  searchMatches[searchCurrentIdx].classList.add('current');
  searchMatches[searchCurrentIdx].scrollIntoView({ block: 'center' });
  searchCount.textContent = `${searchCurrentIdx + 1} / ${searchMatches.length}`;
}

searchInput?.addEventListener('input', () => runSearch(searchInput.value));
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    navigateSearch(e.shiftKey ? searchCurrentIdx - 1 : searchCurrentIdx + 1);
  }
  if (e.key === 'Escape') closeSearch();
});
searchNext?.addEventListener('click', () => navigateSearch(searchCurrentIdx + 1));
searchPrev?.addEventListener('click', () => navigateSearch(searchCurrentIdx - 1));
searchClose?.addEventListener('click', closeSearch);

// ── Developer Console ──────────────────────────────────────────────────────────

const devConsoleEl = document.getElementById('dev-console');
const devConsoleInfo = document.getElementById('dev-console-info');
const devConsoleLogs = document.getElementById('dev-console-logs');
let devLogs = [];

window.api.onDevLog((entry) => {
  devLogs.push(entry);
  if (!devConsoleEl.classList.contains('hidden')) renderDevLog(entry);
});

document.getElementById('dev-console-clear')?.addEventListener('click', () => {
  devLogs = [];
  devConsoleLogs.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'dev-log-empty';
  empty.textContent = 'Logs cleared.';
  devConsoleLogs.appendChild(empty);
});

document.getElementById('dev-console-close')?.addEventListener('click', () => {
  devConsoleEl.classList.add('hidden');
});

function refreshDevConsoleInfo() {
  devConsoleInfo.innerHTML = '';
  const modelItem = document.createElement('div');
  modelItem.className = 'dev-info-item';
  modelItem.innerHTML = `<span class="dev-info-label">Model</span><span class="dev-info-value">${currentModel || '—'}</span>`;
  devConsoleInfo.appendChild(modelItem);

  const serverItem = document.createElement('div');
  serverItem.className = 'dev-info-item';
  serverItem.innerHTML = `<span class="dev-info-label">Server</span><span class="dev-info-value">${serverUrl}</span>`;
  devConsoleInfo.appendChild(serverItem);

  const ctxItem = document.createElement('div');
  ctxItem.className = 'dev-info-item';
  const ctx = getModelContextWindow();
  ctxItem.innerHTML = `<span class="dev-info-label">Context</span><span class="dev-info-value">${ctx > 0 ? ctx.toLocaleString() + ' tokens' : 'unknown'}</span>`;
  devConsoleInfo.appendChild(ctxItem);
}

function renderDevLog(entry) {
  const existing = devConsoleLogs.querySelector('.dev-log-empty');
  if (existing) existing.remove();

  const logEl = document.createElement('div');
  logEl.className = 'dev-log-entry';

  const header = document.createElement('div');
  header.className = 'dev-log-header';

  const arrow = document.createElement('span');
  arrow.className = 'dev-log-arrow';
  arrow.textContent = '▶';

  const time = document.createElement('span');
  time.className = 'dev-log-time';
  const d = new Date(entry.timestamp);
  time.textContent = d.toLocaleTimeString();

  const typeEl = document.createElement('span');
  typeEl.className = `dev-log-type ${entry.type}`;
  typeEl.textContent = entry.type;

  const summary = document.createElement('span');
  summary.className = 'dev-log-summary';
  summary.textContent = entry.endpoint || entry.model || JSON.stringify(entry).slice(0, 60);

  const dur = document.createElement('span');
  dur.className = 'dev-log-duration';
  dur.textContent = entry.durationMs != null ? `${entry.durationMs}ms` : '';

  header.appendChild(arrow);
  header.appendChild(time);
  header.appendChild(typeEl);
  header.appendChild(summary);
  header.appendChild(dur);

  const details = document.createElement('div');
  details.className = 'dev-log-details';

  const rows = [
    ['endpoint', entry.endpoint],
    ['model', entry.model],
    ['messages', entry.messageCount != null ? `${entry.messageCount} messages` : undefined],
    ['duration', entry.durationMs != null ? `${entry.durationMs}ms` : undefined],
    ['chunks', entry.chunkCount != null ? `${entry.chunkCount}` : undefined],
    ['content', entry.contentLength != null ? `${entry.contentLength} chars` : undefined],
    ['status', entry.status],
    ['error', entry.error],
  ];

  for (const [key, val] of rows) {
    if (val == null) continue;
    const row = document.createElement('div');
    row.className = 'dev-log-detail-row';
    row.innerHTML = `<span class="dev-log-detail-key">${key}</span><span class="dev-log-detail-val">${val}</span>`;
    details.appendChild(row);
  }

  if (entry.messages && Array.isArray(entry.messages)) {
    const row = document.createElement('div');
    row.className = 'dev-log-detail-row';
    row.innerHTML = `<span class="dev-log-detail-key">request</span><span class="dev-log-detail-val">${JSON.stringify(entry.messages, null, 2).slice(0, 800)}</span>`;
    details.appendChild(row);
  }

  header.addEventListener('click', () => {
    logEl.classList.toggle('expanded');
  });

  logEl.appendChild(header);
  logEl.appendChild(details);
  devConsoleLogs.appendChild(logEl);
  devConsoleLogs.scrollTop = devConsoleLogs.scrollHeight;
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    if (searchBar.classList.contains('hidden')) openSearch();
    else closeSearch();
  }
  if (e.key === 'Escape') {
    if (!searchBar.classList.contains('hidden')) { closeSearch(); return; }
    if (!settingsPanel.classList.contains('hidden')) { closeSettings(); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    startNewChat();
  }
  if (e.key === '§' || (e.ctrlKey && e.key === '`')) {
    devConsoleEl.classList.toggle('hidden');
    if (!devConsoleEl.classList.contains('hidden')) refreshDevConsoleInfo();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  applyTheme();
  // Load server URL from backend (which persists it)
  try {
    const savedUrl = await window.api.getServerUrl();
    if (savedUrl) {
      serverUrl = savedUrl;
      localStorage.setItem('serverUrl', serverUrl);
      settingsServerUrl.value = serverUrl;
    }
  } catch {}

  await loadModels();
  await loadChats();
  startNewChat();

  // Periodic server status check every 30s
  setInterval(checkServerStatus, 30000);
}

init();
