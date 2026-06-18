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
const settingsTempReset = document.getElementById('settings-temp-reset');
const settingsMaxTokens = document.getElementById('settings-max-tokens');
const scrollTopBtn      = document.getElementById('scroll-top-btn');
const scrollBottomBtn   = document.getElementById('scroll-bottom-btn');
const imagePreview      = document.getElementById('image-preview');
const imagePreviewList  = document.getElementById('image-preview-list');
const imagePreviewClear = document.getElementById('image-preview-clear');
const settingsModelSelect = document.getElementById('settings-model-select');
const settingsModelRefresh = document.getElementById('settings-model-refresh');
const settingsModelDetails = document.getElementById('settings-model-details');
const settingsImageAnalysisModel = document.getElementById('settings-image-analysis-model');
const imageAnalysisBeforeSend = document.getElementById('image-analysis-before-send');
const settingsUseCurrentImageAnalysis = document.getElementById('settings-use-current-image-analysis');
const settingsIncludeImageAnalysisContext = document.getElementById('settings-include-image-analysis-context');
const setupChecklist = document.getElementById('setup-checklist');

// ── State ─────────────────────────────────────────────────────────────────────

let MODELS = {};
let currentModel = localStorage.getItem('selectedModel') || null;
let imageAnalysisModel = localStorage.getItem('imageAnalysisModel') || '';
let analyzeImagesBeforeSend = false;
let useCurrentModelForImageAnalysis = localStorage.getItem('useCurrentModelForImageAnalysis') !== '0';
let includeImageAnalysisInContext = localStorage.getItem('includeImageAnalysisInContext') === '1';
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
let pendingImages = [];
let autoScrollEnabled = true;
let isProgrammaticScroll = false;
let autoScrollDebounceTimer = null;
let activeGeneration = null;
let modelLoadRequestId = 0;

const STOP_GRACE_MS = 2500;
const IMAGE_ANALYSIS_MAX_TOKENS = 8192;
const VISION_MODEL_PATTERNS = [
  /vision/i,
  /omni/i,
  /multimodal/i,
  /\bvl\b/i,
  /llava/i,
  /moondream/i,
  /minicpm[-_ ]?v/i,
  /qwen\d*(?:\.\d+)?[-_ ]?vl/i,
  /qwen[-_ ]?vl/i,
  /pixtral/i,
  /internvl/i,
  /cogvlm/i,
  /idefics/i,
  /florence/i,
  /paligemma/i
];

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

settingsTempReset?.addEventListener('click', () => {
  currentTemp = 0.7;
  settingsTemp.value = currentTemp;
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

function getImageUrls(msg) {
  if (!Array.isArray(msg.content)) return [];
  return msg.content
    .filter(p => p.type === 'image_url' && p.image_url?.url)
    .map(p => p.image_url.url);
}

function getImageParts(msg) {
  if (!Array.isArray(msg.content)) return [];
  return msg.content
    .map((part, partIndex) => ({ part, partIndex }))
    .filter(item => item.part.type === 'image_url' && item.part.image_url?.url);
}

function getChatMonth(chat) {
  const created = chat?.created || new Date().toISOString();
  if (/^\d{4}-\d{2}/.test(created)) return `${created.slice(0, 4)}/${created.slice(5, 7)}`;
  return 'unknown';
}

function getVisionOverrides() {
  try {
    return JSON.parse(localStorage.getItem('modelVisionOverrides') || '{}') || {};
  } catch {
    return {};
  }
}

function setVisionOverride(modelId, value) {
  if (!modelId) return;
  const overrides = getVisionOverrides();
  if (value === 'auto') delete overrides[modelId];
  else overrides[modelId] = value;
  localStorage.setItem('modelVisionOverrides', JSON.stringify(overrides));
  renderModelSettings();
  renderSetupChecklist();
  updateContextBar();
}

function textContainsVisionHint(value) {
  return typeof value === 'string' && /\b(image|images|vision|visual|multimodal|vl|video)\b/i.test(value);
}

function valueHasVisionCapability(value, depth = 0) {
  if (depth > 4 || value == null) return false;
  if (Array.isArray(value)) return value.some(v => valueHasVisionCapability(v, depth + 1));
  if (typeof value === 'string') return textContainsVisionHint(value);
  if (typeof value !== 'object') return false;
  return Object.entries(value).some(([key, val]) => {
    if (textContainsVisionHint(key) && val !== false && val !== 'false') return true;
    return valueHasVisionCapability(val, depth + 1);
  });
}

function inferVisionCapability(modelId) {
  const info = MODELS[modelId];
  const override = getVisionOverrides()[modelId];
  if (override === 'yes') return { state: 'vision', source: 'manual setting', trusted: true, manual: true };
  if (override === 'no') return { state: 'text-only', source: 'manual setting', trusted: false, manual: true };

  if (info?.vision === true) return { state: 'vision', source: info.visionSource || 'server metadata', trusted: true, manual: false };
  if (info?.vision === false) return { state: 'unknown', source: 'not advertised', trusted: false, manual: false };
  if (info?.raw && valueHasVisionCapability(info.raw)) return { state: 'vision', source: 'server metadata', trusted: true, manual: false };
  if (VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelId || ''))) {
    return { state: 'vision', source: 'model name', trusted: true, manual: false };
  }
  return { state: 'unknown', source: 'not advertised', trusted: false, manual: false };
}

function messageHasImages(msg) {
  return Array.isArray(msg.content) && msg.content.some(p => p.type === 'image_url');
}

function modelReceivesActualImages(modelId) {
  const capability = inferVisionCapability(modelId);
  return capability.trusted;
}

function isTrustedVisionModel(modelId) {
  return inferVisionCapability(modelId).trusted;
}

function getImagePlaceholder(part, index) {
  const name = part._attachment || part._filename || `image-${index + 1}`;
  const ext = part._ext ? `, ${part._ext.toUpperCase()}` : '';
  return `[Attached image: ${name}${ext}. The selected model cannot inspect images.]`;
}

function getImageDescriptionText(part, index, { force = false } = {}) {
  const analysis = part.imageAnalysis?.description;
  if (analysis && (force || includeImageAnalysisInContext)) {
    const name = part._attachment || part._filename || `image-${index + 1}`;
    return `[Attached image: ${name}]\nImage analysis: ${analysis}`;
  }
  return getImagePlaceholder(part, index);
}

function buildApiMessagesForModel(messages, modelId, { forceImageDescriptionsForLastUser = false } = {}) {
  const includeImages = modelReceivesActualImages(modelId);
  let lastUserIdx = -1;
  if (forceImageDescriptionsForLastUser) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
  }

  return messages.map((msg, msgIndex) => {
    if (!Array.isArray(msg.content)) return { role: msg.role, content: msg.content };

    if (includeImages && msgIndex !== lastUserIdx) {
      const content = [];
      for (const part of msg.content) {
        if (part.type === 'image_url') {
          content.push({
            type: 'image_url',
            image_url: { url: part.image_url?.url || '' }
          });
          if (includeImageAnalysisInContext && part.imageAnalysis?.description) {
            content.push({ type: 'text', text: getImageDescriptionText(part, content.length) });
          }
        } else if (part.type === 'text') {
          content.push({ type: 'text', text: part.text || '' });
        } else {
          content.push({ ...part });
        }
      }
      return {
        role: msg.role,
        content
      };
    }

    const text = msg.content
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .filter(Boolean)
      .join('\n');
    const imageNotes = msg.content
      .filter(part => part.type === 'image_url')
      .map((part, index) => getImageDescriptionText(part, index, { force: msgIndex === lastUserIdx }));

    return {
      role: msg.role,
      content: [text, ...imageNotes].filter(Boolean).join('\n\n')
    };
  });
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
  const vision = inferVisionCapability(currentModel);
  const visionLabel = vision.trusted ? 'vision model' : '';
  const modelLabel = currentModel
    ? (currentModel.split('/').pop() || currentModel).slice(0, 40)
    : '—';
  const parts = [`◈ ${modelLabel}`];
  if (visionLabel) parts.push(visionLabel);

  if (ctx <= 0) {
    contextBarLabel.textContent = `${parts.join('  ·  ')}  ·  ~${tokens.toLocaleString()} tokens`;
    contextBarFill.style.width = '0%';
    contextBarFill.classList.remove('warn');
    return;
  }

  const pct = Math.min(100, Math.round((tokens / ctx) * 100));
  const warn = pct >= 75;
  contextBarFill.style.width = pct + '%';
  contextBarFill.classList.toggle('warn', warn);
  contextBarLabel.textContent =
    `${parts.join('  ·  ')}  ·  ~${tokens.toLocaleString()} / ${ctx.toLocaleString()} tokens  ·  ${pct}%`;
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
      MODELS[m.id] = {
        contextLength: m.contextLength || 0,
        vision: typeof m.vision === 'boolean' ? m.vision : undefined,
        visionSource: m.visionSource || '',
        raw: m.raw || null
      };
    }
    populateModelSelects(result.models);
    populateSettingsModelSelect(result.models);

    // Restore or pick model
    if (currentModel && MODELS[currentModel]) {
      applySelectedModel(currentModel, false, { preload: false });
    } else if (result.models.length > 0) {
      applySelectedModel(result.models[0].id, true, { preload: false });
    }
    updateContextBar();
    renderModelSettings();
    renderSetupChecklist();
  } catch {
    setServerStatus('offline');
    populateModelSelects([]);
    populateSettingsModelSelect([]);
    renderSetupChecklist();
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

function populateSettingsModelSelect(models) {
  if (!settingsModelSelect) return;
  settingsModelSelect.innerHTML = '';
  if (settingsImageAnalysisModel) settingsImageAnalysisModel.innerHTML = '';
  if (!models.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No models';
    settingsModelSelect.appendChild(opt);
    if (settingsImageAnalysisModel) settingsImageAnalysisModel.appendChild(opt.cloneNode(true));
    return;
  }
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.id.split('/').pop() || m.id;
    settingsModelSelect.appendChild(opt);
    if (settingsImageAnalysisModel) settingsImageAnalysisModel.appendChild(opt.cloneNode(true));
  }
  settingsModelSelect.value = currentModel || models[0].id;
  if (!imageAnalysisModel || !MODELS[imageAnalysisModel]) {
    imageAnalysisModel = currentModel || models[0].id;
    localStorage.setItem('imageAnalysisModel', imageAnalysisModel);
  }
  if (settingsImageAnalysisModel) settingsImageAnalysisModel.value = imageAnalysisModel;
}

function renderModelSettings() {
  if (!settingsModelDetails) return;
  const modelId = settingsModelSelect?.value || currentModel || '';
  const info = MODELS[modelId];
  settingsModelDetails.innerHTML = '';

  if (!modelId || !info) {
    const empty = document.createElement('div');
    empty.className = 'model-settings-empty';
    empty.textContent = 'No model selected.';
    settingsModelDetails.appendChild(empty);
    return;
  }

  const capability = inferVisionCapability(modelId);
  const overrides = getVisionOverrides();
  const override = overrides[modelId] || 'auto';

  const title = document.createElement('div');
  title.className = 'model-settings-title';
  title.textContent = modelId;
  settingsModelDetails.appendChild(title);

  const rows = [
    ['Context', info.contextLength ? `${info.contextLength.toLocaleString()} tokens` : 'unknown'],
    ['Image capability', capability.state],
    ['Detected by', capability.source],
    ['API images', modelReceivesActualImages(modelId) ? 'actual images' : 'text placeholders'],
    ['Analyzer if current', isTrustedVisionModel(modelId) ? 'allowed' : 'fallback required'],
    ['Fallback analyzer', imageAnalysisModel || 'not selected'],
    ['Effective analyzer', getImageAnalysisModel() || 'not selected']
  ];

  const table = document.createElement('div');
  table.className = 'model-info-table';
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'model-info-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    table.appendChild(row);
  }
  settingsModelDetails.appendChild(table);

  const overrideLabel = document.createElement('label');
  overrideLabel.className = 'settings-label';
  overrideLabel.textContent = 'Image capability';
  settingsModelDetails.appendChild(overrideLabel);

  const overrideSelect = document.createElement('select');
  overrideSelect.className = 'model-override-select';
  [
    ['auto', 'Auto detect'],
    ['yes', 'Vision enabled'],
    ['no', 'Text-only']
  ].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    overrideSelect.appendChild(opt);
  });
  overrideSelect.value = override;
  overrideSelect.addEventListener('change', () => setVisionOverride(modelId, overrideSelect.value));
  settingsModelDetails.appendChild(overrideSelect);

  const rawLabel = document.createElement('label');
  rawLabel.className = 'settings-label';
  rawLabel.textContent = 'Server metadata';
  settingsModelDetails.appendChild(rawLabel);

  const raw = document.createElement('pre');
  raw.className = 'model-raw-json';
  raw.textContent = JSON.stringify(info.raw || { id: modelId, contextLength: info.contextLength }, null, 2);
  settingsModelDetails.appendChild(raw);
}

function createSetupItem({ state, title, body, actionText, action }) {
  const item = document.createElement('div');
  item.className = `setup-item ${state}`;

  const marker = document.createElement('span');
  marker.className = 'setup-item-marker';
  marker.textContent = state === 'done' ? '✓' : state === 'warn' ? '!' : '•';

  const content = document.createElement('div');
  content.className = 'setup-item-content';

  const heading = document.createElement('div');
  heading.className = 'setup-item-title';
  heading.textContent = title;

  const text = document.createElement('div');
  text.className = 'setup-item-body';
  text.textContent = body;

  content.appendChild(heading);
  content.appendChild(text);

  if (actionText && action) {
    const btn = document.createElement('button');
    btn.className = 'setup-item-action';
    btn.textContent = actionText;
    btn.addEventListener('click', action);
    content.appendChild(btn);
  }

  item.appendChild(marker);
  item.appendChild(content);
  return item;
}

function openSettingsTab(name) {
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const active = btn.dataset.settingsTab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.settings-pane').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.settingsPane === name);
  });
  if (name === 'models') renderModelSettings();
  if (name === 'setup') renderSetupChecklist();
}

function renderSetupChecklist() {
  if (!setupChecklist) return;
  setupChecklist.innerHTML = '';

  const selectedCapability = inferVisionCapability(currentModel);
  const analysisCapability = inferVisionCapability(imageAnalysisModel);
  const hasModels = Object.keys(MODELS).length > 0;

  const intro = document.createElement('div');
  intro.className = 'setup-intro';
  intro.innerHTML = `
    <div class="setup-intro-title">App and model setup checklist</div>
    <div class="setup-intro-text">Manual model capability settings are expected for local models. The app auto-detects strong vision signals, saves pasted images, and can store reusable image descriptions, but you decide which models can receive images.</div>
  `;
  setupChecklist.appendChild(intro);

  const items = [
    {
      state: serverOnline ? 'done' : 'todo',
      title: 'Connect to your local server',
      body: serverOnline
        ? `Connected to ${serverUrl}.`
        : 'Start LM Studio or your OpenAI-compatible local server, then connect from General settings.',
      actionText: 'General',
      action: () => openSettingsTab('general')
    },
    {
      state: hasModels ? 'done' : 'todo',
      title: 'Load or expose models',
      body: hasModels
        ? `${Object.keys(MODELS).length} model${Object.keys(MODELS).length === 1 ? '' : 's'} available.`
        : 'Load a model in your server, then refresh the model list.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    },
    {
      state: currentModel ? 'done' : 'todo',
      title: 'Choose the active chat model',
      body: currentModel
        ? `Current chat model: ${currentModel}.`
        : 'Pick the model used for normal chat replies.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    },
    {
      state: selectedCapability.manual || selectedCapability.trusted ? 'done' : 'warn',
      title: 'Set image capability for each model',
      body: selectedCapability.manual
        ? `This model is manually set to ${selectedCapability.state}.`
        : selectedCapability.trusted
          ? `Detected as a vision model by ${selectedCapability.source}. Review manually if needed.`
          : 'Unknown models are treated as text-only until you mark them Vision enabled. This avoids sending images to text-only models by accident.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    },
    {
      state: imageAnalysisModel ? 'done' : 'todo',
      title: 'Choose a fallback image analysis model',
      body: imageAnalysisModel
        ? `Fallback analyzer: ${imageAnalysisModel}${analysisCapability.trusted ? ' (trusted vision).' : ' (mark it Vision enabled if it can inspect images).' }`
        : 'Pick a vision-capable fallback model for reusable image descriptions and text-only chat workflows.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    },
    {
      state: useCurrentModelForImageAnalysis ? 'done' : 'warn',
      title: 'Decide how image analysis models are chosen',
      body: useCurrentModelForImageAnalysis
        ? 'When the active model is trusted vision, it is used for image analysis; otherwise the fallback analyzer is used.'
        : 'The fallback analyzer is always used for image analysis, even if the active model is vision-capable.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    },
    {
      state: includeImageAnalysisInContext ? 'done' : 'warn',
      title: 'Decide whether saved analyses enter chat context',
      body: includeImageAnalysisInContext
        ? 'Saved image descriptions are included in API context through the projection layer, without changing visible chat text.'
        : 'Saved image descriptions remain available from badges, but are not added to chat context unless needed by an explicit analyze-first send.',
      actionText: 'Models',
      action: () => openSettingsTab('models')
    }
  ];

  const list = document.createElement('div');
  list.className = 'setup-list';
  for (const item of items) list.appendChild(createSetupItem(item));
  setupChecklist.appendChild(list);
}

function setModelSelectTitles(text) {
  [modelSelect, floatingModelSelect, settingsModelSelect].forEach(sel => {
    if (sel) sel.title = text || 'Select model';
  });
}

async function preloadSelectedModel(modelId) {
  if (!modelId || !serverOnline) return;
  const requestId = ++modelLoadRequestId;
  setModelSelectTitles(`Loading ${modelId} in LM Studio...`);
  try {
    const result = await window.api.loadModel(modelId);
    if (requestId !== modelLoadRequestId) return;
    if (result?.cancelled) {
      return;
    } else if (result?.ok) {
      setModelSelectTitles(`Loaded ${modelId}`);
      setServerStatus('online');
    } else {
      const unsupported = result?.unsupported ? ' LM Studio load endpoint not available.' : '';
      setModelSelectTitles(`Selected ${modelId}.${unsupported}`);
    }
  } catch (err) {
    if (requestId !== modelLoadRequestId) return;
    setModelSelectTitles(`Selected ${modelId}. Load request failed.`);
    console.warn('Model preload failed:', err);
  }
}

function applySelectedModel(modelId, persist = true, { preload = true } = {}) {
  currentModel = modelId;
  [modelSelect, floatingModelSelect].forEach(sel => {
    if (sel) sel.value = modelId;
  });
  if (settingsModelSelect) settingsModelSelect.value = modelId;
  if (persist) localStorage.setItem('selectedModel', modelId);
  if (currentChat) currentChat.model = modelId;
  // Update context window from model metadata if not manually overridden
  if (!localStorage.getItem('contextWindow') && MODELS[modelId]) {
    currentContextWindow = MODELS[modelId].contextLength || 0;
  }
  updateContextBar();
  renderModelSettings();
  renderSetupChecklist();
  renderPendingImages();
  if (preload) preloadSelectedModel(modelId);
}

modelSelect?.addEventListener('change', () => applySelectedModel(modelSelect.value, true, { preload: true }));
floatingModelSelect?.addEventListener('change', () => applySelectedModel(floatingModelSelect.value, true, { preload: true }));
settingsModelSelect?.addEventListener('change', () => {
  applySelectedModel(settingsModelSelect.value, true, { preload: true });
  renderModelSettings();
});
settingsModelRefresh?.addEventListener('click', () => loadModels(true));
settingsImageAnalysisModel?.addEventListener('change', () => {
  imageAnalysisModel = settingsImageAnalysisModel.value;
  localStorage.setItem('imageAnalysisModel', imageAnalysisModel);
  renderModelSettings();
  renderSetupChecklist();
});
if (settingsUseCurrentImageAnalysis) settingsUseCurrentImageAnalysis.checked = useCurrentModelForImageAnalysis;
settingsUseCurrentImageAnalysis?.addEventListener('change', () => {
  useCurrentModelForImageAnalysis = settingsUseCurrentImageAnalysis.checked;
  localStorage.setItem('useCurrentModelForImageAnalysis', useCurrentModelForImageAnalysis ? '1' : '0');
  renderModelSettings();
  renderSetupChecklist();
  renderPendingImages();
});
if (settingsIncludeImageAnalysisContext) settingsIncludeImageAnalysisContext.checked = includeImageAnalysisInContext;
settingsIncludeImageAnalysisContext?.addEventListener('change', () => {
  includeImageAnalysisInContext = settingsIncludeImageAnalysisContext.checked;
  localStorage.setItem('includeImageAnalysisInContext', includeImageAnalysisInContext ? '1' : '0');
  renderModelSettings();
  renderSetupChecklist();
});
if (imageAnalysisBeforeSend) imageAnalysisBeforeSend.checked = false;
imageAnalysisBeforeSend?.addEventListener('change', () => {
  analyzeImagesBeforeSend = imageAnalysisBeforeSend.checked;
});

document.querySelectorAll('.settings-tab').forEach(tab => {
  tab.addEventListener('click', () => openSettingsTab(tab.dataset.settingsTab));
});

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
let activeImageContextMenu = null;
let activeImageAnalysisPopup = null;

function closeImageContextMenu() {
  if (activeImageContextMenu) {
    activeImageContextMenu.remove();
    activeImageContextMenu = null;
    document.removeEventListener('mousedown', handleImageContextMenuOutside);
    contextMenuJustClosed = true;
    setTimeout(() => { contextMenuJustClosed = false; }, 100);
  }
}

function handleImageContextMenuOutside(e) {
  if (activeImageContextMenu && !activeImageContextMenu.contains(e.target)) {
    closeImageContextMenu();
    document.removeEventListener('mousedown', handleImageContextMenuOutside);
  }
}

function getImagePartRef(msgIndex, partIndex) {
  const msg = conversationHistory[msgIndex];
  if (!msg || !Array.isArray(msg.content)) return null;
  const part = msg.content[partIndex];
  if (!part || part.type !== 'image_url') return null;
  return { msg, part, msgIndex, partIndex };
}

function closeImageAnalysisPopup() {
  if (!activeImageAnalysisPopup) return;
  activeImageAnalysisPopup.remove();
  activeImageAnalysisPopup = null;
  document.removeEventListener('mousedown', handleImageAnalysisPopupOutside);
}

function handleImageAnalysisPopupOutside(e) {
  if (activeImageAnalysisPopup && !activeImageAnalysisPopup.contains(e.target)) {
    closeImageAnalysisPopup();
  }
}

function openImageAnalysisPopup(anchor, msgIndex, partIndex) {
  const ref = getImagePartRef(msgIndex, partIndex);
  const analysis = ref?.part?.imageAnalysis;
  if (!analysis?.description) return;

  closeImageAnalysisPopup();
  const popup = document.createElement('div');
  popup.className = 'image-analysis-popup';

  const header = document.createElement('div');
  header.className = 'image-analysis-popup-header';

  const title = document.createElement('span');
  title.textContent = 'Image analysis';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeImageAnalysisPopup();
  });

  const meta = document.createElement('div');
  meta.className = 'image-analysis-popup-meta';
  const created = analysis.createdAt ? new Date(analysis.createdAt).toLocaleString() : '';
  meta.textContent = [analysis.model, created].filter(Boolean).join(' · ');

  const body = document.createElement('textarea');
  body.className = 'image-analysis-popup-text';
  body.readOnly = true;
  body.value = analysis.description;

  header.appendChild(title);
  header.appendChild(closeBtn);
  popup.appendChild(header);
  if (meta.textContent) popup.appendChild(meta);
  popup.appendChild(body);
  document.body.appendChild(popup);

  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let left = anchorRect.left;
  let top = anchorRect.bottom + 8;
  if (left + popupRect.width > window.innerWidth - 8) left = window.innerWidth - popupRect.width - 8;
  if (top + popupRect.height > window.innerHeight - 8) top = Math.max(8, anchorRect.top - popupRect.height - 8);
  popup.style.left = Math.max(8, left) + 'px';
  popup.style.top = Math.max(8, top) + 'px';
  activeImageAnalysisPopup = popup;

  requestAnimationFrame(() => {
    document.addEventListener('mousedown', handleImageAnalysisPopupOutside);
  });
}

function createImageAnalysisBadge(msgIndex, partIndex) {
  const btn = document.createElement('button');
  btn.className = 'image-analysis-badge';
  btn.textContent = 'Image analysis';
  btn.title = 'View image analysis';
  btn.dataset.msgIndex = String(msgIndex);
  btn.dataset.partIndex = String(partIndex);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageAnalysisPopup(btn, msgIndex, partIndex);
  });
  return btn;
}

function createImageFrame(img, msgIndex, partIndex, hasAnalysis) {
  const frame = document.createElement('div');
  frame.className = 'message-image-frame';
  frame.appendChild(img);
  if (hasAnalysis) frame.appendChild(createImageAnalysisBadge(msgIndex, partIndex));
  return frame;
}

function createImageMenuItem(label, handler) {
  const btn = document.createElement('button');
  btn.className = 'img-context-menu-item';
  btn.textContent = label;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeImageContextMenu();
    await handler();
  });
  return btn;
}

function showImageContextMenu(event, img) {
  closeImageContextMenu();
  const msgIndex = parseInt(img.dataset.msgIndex || '', 10);
  const partIndex = parseInt(img.dataset.partIndex || '', 10);
  const ref = getImagePartRef(msgIndex, partIndex);
  if (!ref) return;

  const menu = document.createElement('div');
  menu.className = 'img-context-menu';
  menu.appendChild(createImageMenuItem('Analyze image', () => analyzeImagePart(msgIndex, partIndex, { force: false })));
  menu.appendChild(createImageMenuItem('Re-analyze image', () => analyzeImagePart(msgIndex, partIndex, { force: true })));
  menu.appendChild(createImageMenuItem('Analyze all images in chat', () => analyzeAllImagesInChat({ force: false })));
  menu.appendChild(createImageMenuItem('Re-analyze all images in chat', () => analyzeAllImagesInChat({ force: true })));

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.min(event.clientX, window.innerWidth - rect.width - 8) + 'px';
  menu.style.top = Math.min(event.clientY, window.innerHeight - rect.height - 8) + 'px';
  activeImageContextMenu = menu;
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', handleImageContextMenuOutside);
  });
}

messagesEl.addEventListener('mousedown', () => {
  const sel = window.getSelection();
  hadSelectionOnMousedown = sel && sel.toString().length > 0;
});

messagesEl.addEventListener('contextmenu', (e) => {
  const img = e.target.closest('.message img');
  if (!img || img.closest('.message.editing')) return;
  e.preventDefault();
  showImageContextMenu(e, img);
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

  if (typeof content === 'object' && content !== null && !Array.isArray(content) && content.images) {
    for (const [imageIndex, imgUrl] of content.images.entries()) {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = 'Attached image';
      if (typeof msgIndex === 'number') {
        img.dataset.msgIndex = String(msgIndex);
        img.dataset.partIndex = String(imageIndex);
      }
      div.appendChild(createImageFrame(img, msgIndex, imageIndex, false));
    }
    if (content.text) {
      if (role === 'assistant') {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = renderMarkdown(content.text);
        div.appendChild(textDiv);
      } else {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = content.text;
        div.appendChild(textDiv);
      }
    }
  } else if (role === 'assistant') {
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
  const images = getImageParts(msg);
  if (images.length > 0) {
    for (const { part, partIndex } of images) {
      const img = document.createElement('img');
      img.src = part.image_url.url;
      img.alt = 'Attached image';
      img.dataset.msgIndex = String(index);
      img.dataset.partIndex = String(partIndex);
      const hasAnalysis = Boolean(part.imageAnalysis?.description);
      if (hasAnalysis) img.classList.add('has-image-analysis');
      div.appendChild(createImageFrame(img, index, partIndex, hasAnalysis));
    }
    if (text) {
      if (msg.role === 'assistant') {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = renderMarkdown(text);
        div.appendChild(textDiv);
      } else {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;
        div.appendChild(textDiv);
      }
    }
  } else if (msg.role === 'assistant') {
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

  const originalMsg = conversationHistory[msgIndex];
  const originalText = getDisplayText(originalMsg);
  const originalImages = getImageUrls(originalMsg);
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
    msgDiv.replaceWith(renderMessage(originalMsg, msgIndex));
    markLatestUnanswered();
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
  for (const imgUrl of originalImages) {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = 'Attached image';
    img.className = 'edit-preview-img';
    msgDiv.appendChild(img);
  }
  msgDiv.appendChild(textarea);
  msgDiv.appendChild(btns);
  textarea.focus();
  textarea.selectionStart = textarea.value.length;
}

async function submitEditMessage(msgIndex, newText) {
  newText = newText.trim();
  const originalMsg = conversationHistory[msgIndex];
  const originalImages = Array.isArray(originalMsg.content)
    ? originalMsg.content.filter(p => p.type === 'image_url')
    : [];
  if (!newText && originalImages.length === 0) return;

  const truncatedHistory = JSON.parse(JSON.stringify(conversationHistory.slice(0, msgIndex)));
  const groupId = currentChat?.branchGroup || generateId();
  const editedContent = originalImages.length > 0
    ? [
        ...originalImages.map(p => ({ type: 'image_url', image_url: { url: p.image_url.url }, _ext: p._ext })),
        ...(newText ? [{ type: 'text', text: newText }] : [])
      ]
    : newText;

  // Fork to a new chat
  const branchId = generateId();
  const branchChat = {
    id: branchId,
    title: currentChat?.title || 'Chat',
    created: new Date().toISOString(),
    model: currentModel || '',
    branchGroup: groupId,
    messages: [...truncatedHistory, { role: 'user', content: editedContent }]
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
    applySelectedModel(chat.model, false, { preload: true });
  } else if (currentModel) {
    applySelectedModel(currentModel, false, { preload: false });
  }
  updateContextBar();
}

function startNewChat() {
  if (document.body.classList.contains('streaming')) return;
  clearPendingImages();
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

// ── Image composer ────────────────────────────────────────────────────────────

function clearPendingImages() {
  pendingImages = [];
  analyzeImagesBeforeSend = false;
  if (imageAnalysisBeforeSend) imageAnalysisBeforeSend.checked = false;
  renderPendingImages();
}

function addPendingImage(dataUrl, ext) {
  if (pendingImages.length === 0) {
    analyzeImagesBeforeSend = false;
    if (imageAnalysisBeforeSend) imageAnalysisBeforeSend.checked = false;
  }
  pendingImages.push({ dataUrl, ext });
  renderPendingImages();
  inputEl.focus();
}

function removePendingImage(index) {
  pendingImages.splice(index, 1);
  renderPendingImages();
}

function renderPendingImages() {
  if (!imagePreview || !imagePreviewList) return;
  imagePreviewList.innerHTML = '';
  if (pendingImages.length === 0) {
    imagePreview.classList.add('hidden');
    return;
  }

  const capability = inferVisionCapability(currentModel);
  imagePreview.classList.remove('hidden');
  imagePreview.classList.toggle('unsupported', capability.state === 'text-only');
  imagePreview.title = capability.state === 'text-only'
    ? 'The selected model is set to text-only.'
    : capability.state === 'unknown'
      ? 'This model is not marked as vision-capable. Mark it in Settings > Models to send images directly.'
      : '';

  for (const [i, img] of pendingImages.entries()) {
    const thumb = document.createElement('div');
    thumb.className = 'image-preview-thumb';

    const imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.alt = 'Image preview';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'thumb-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', () => removePendingImage(i));

    thumb.appendChild(imgEl);
    thumb.appendChild(removeBtn);
    imagePreviewList.appendChild(thumb);
  }
}

imagePreviewClear?.addEventListener('click', clearPendingImages);

// ── Image analysis ────────────────────────────────────────────────────────────

function getImageAnalysisModel() {
  if (useCurrentModelForImageAnalysis && isTrustedVisionModel(currentModel)) {
    return currentModel || '';
  }
  return imageAnalysisModel || '';
}

function getImageAnalysisModelSource() {
  if (useCurrentModelForImageAnalysis && isTrustedVisionModel(currentModel)) {
    return 'current';
  }
  return 'fallback';
}

function createImageAnalysisBubble(label = 'Image analysis') {
  const div = document.createElement('div');
  div.className = 'message image-analysis-status';
  div.setAttribute('role', 'status');
  div.setAttribute('aria-live', 'polite');

  const title = document.createElement('span');
  title.className = 'image-analysis-title';
  title.textContent = label;

  const state = document.createElement('span');
  state.className = 'image-analysis-state';
  state.textContent = 'starting';

  div.appendChild(title);
  div.appendChild(state);
  messagesEl.appendChild(div);

  return {
    element: div,
    set(text) {
      state.textContent = text;
    },
    done(text) {
      state.textContent = text || 'done';
      div.classList.add('done');
    },
    error(text) {
      state.textContent = text || 'failed';
      div.classList.add('error');
    }
  };
}

async function persistConversationMessages() {
  if (!currentChat) return;
  currentChat.messages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
  await saveCurrentChat();
}

async function analyzeImagePart(msgIndex, partIndex, { force = false, bubble = null } = {}) {
  const ref = getImagePartRef(msgIndex, partIndex);
  if (!ref) return { skipped: true };
  if (!force && ref.part.imageAnalysis?.description) {
    if (!bubble) {
      const localBubble = createImageAnalysisBubble('Image analysis');
      localBubble.done('already analyzed');
    }
    return { skipped: true, existing: true };
  }

  const model = getImageAnalysisModel();
  if (!model) {
    addMessage('error', 'No image analysis model selected. Choose one in Settings > Models.');
    return { error: 'No image analysis model selected.' };
  }

  const localBubble = bubble || createImageAnalysisBubble('Image analysis');
  localBubble.set('analyzing');
  let streamed = '';
  const messages = [{
    role: 'user',
    content: [{
      type: 'image_url',
      image_url: { url: ref.part.image_url.url }
    }]
  }];

  const result = await window.api.analyzeImage(
    messages,
    { model, temperature: 0.2, maxTokens: IMAGE_ANALYSIS_MAX_TOKENS },
    (chunk) => {
      streamed += chunk;
      localBubble.set(`${streamed.length.toLocaleString()} chars`);
    }
  );

  if (result?.error) {
    localBubble.error('failed');
    addMessage('error', `Image analysis failed: ${result.error}`);
    return { error: result.error };
  }
  if (result?.cancelled) {
    localBubble.error('cancelled');
    return { cancelled: true };
  }

  const description = (result?.content || streamed).trim();
  if (!description) {
    localBubble.error('empty result');
    return { error: 'Image analysis returned no text.' };
  }

  ref.part.imageAnalysis = {
    model,
    modelSource: getImageAnalysisModelSource(),
    createdAt: new Date().toISOString(),
    description,
    promptVersion: 1
  };
  await persistConversationMessages();
  localBubble.done('done');
  renderMessageAnalysisMarker(msgIndex, partIndex);
  return { analyzed: true, description };
}

function renderMessageAnalysisMarker(msgIndex, partIndex) {
  const img = messagesEl.querySelector(`img[data-msg-index="${msgIndex}"][data-part-index="${partIndex}"]`);
  if (!img) return;
  img.classList.add('has-image-analysis');
  const frame = img.closest('.message-image-frame');
  if (frame && !frame.querySelector('.image-analysis-badge')) {
    frame.appendChild(createImageAnalysisBadge(msgIndex, partIndex));
  }
}

function getAllImageRefs() {
  const refs = [];
  conversationHistory.forEach((msg, msgIndex) => {
    if (!Array.isArray(msg.content)) return;
    msg.content.forEach((part, partIndex) => {
      if (part.type === 'image_url' && part.image_url?.url) {
        refs.push({ msgIndex, partIndex, part });
      }
    });
  });
  return refs;
}

async function analyzeAllImagesInChat({ force = false } = {}) {
  const refs = getAllImageRefs();
  if (!refs.length) {
    addMessage('error', 'No images in this chat.');
    return;
  }

  const bubble = createImageAnalysisBubble(force ? 'Re-analyze all images' : 'Analyze all images');
  let analyzed = 0;
  let skipped = 0;
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    if (!force && ref.part.imageAnalysis?.description) {
      skipped += 1;
      bubble.set(`${i + 1} / ${refs.length}`);
      continue;
    }
    bubble.set(`${i + 1} / ${refs.length}`);
    const result = await analyzeImagePart(ref.msgIndex, ref.partIndex, { force, bubble });
    if (result?.error || result?.cancelled) {
      bubble.error('stopped');
      return;
    }
    if (result?.analyzed) analyzed += 1;
    else skipped += 1;
  }
  bubble.done(`${analyzed} analyzed, ${skipped} skipped`);
}

async function analyzeMessageImages(msgIndex, { force = false } = {}) {
  const msg = conversationHistory[msgIndex];
  const refs = getImageParts(msg);
  if (!refs.length) return;

  const bubble = createImageAnalysisBubble('Image analysis');
  let analyzed = 0;
  let skipped = 0;
  for (let i = 0; i < refs.length; i++) {
    bubble.set(`${i + 1} / ${refs.length}`);
    const result = await analyzeImagePart(msgIndex, refs[i].partIndex, { force, bubble });
    if (result?.error || result?.cancelled) {
      throw new Error(result.error || 'Image analysis cancelled.');
    }
    if (result?.analyzed) analyzed += 1;
    else skipped += 1;
  }
  bubble.done(`${analyzed} analyzed, ${skipped} skipped`);
}

async function analyzeMissingImagesForTextProjection() {
  if (modelReceivesActualImages(currentModel)) return false;
  if (!includeImageAnalysisInContext) return false;
  const missing = getAllImageRefs().filter(ref => !ref.part.imageAnalysis?.description);
  if (!missing.length) return false;

  const bubble = createImageAnalysisBubble('Image analysis');
  let analyzed = 0;
  for (let i = 0; i < missing.length; i++) {
    const ref = missing[i];
    bubble.set(`${i + 1} / ${missing.length}`);
    const result = await analyzeImagePart(ref.msgIndex, ref.partIndex, { force: false, bubble });
    if (result?.error || result?.cancelled) {
      throw new Error(result.error || 'Image analysis cancelled.');
    }
    if (result?.analyzed) analyzed += 1;
  }
  bubble.done(`${analyzed} analyzed`);
  return analyzed > 0;
}

// ── Sending messages ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if ((!text && pendingImages.length === 0) || document.body.classList.contains('streaming')) return;
  if (!currentModel) {
    addMessage('error', 'No model selected. Start LM Studio and load a model first.');
    return;
  }
  inputEl.value = '';
  autoResizeTextarea();

  let userMsg;
  let displayContent;
  if (pendingImages.length > 0) {
    const parts = pendingImages.map(img => ({
      type: 'image_url',
      image_url: { url: img.dataUrl },
      _ext: img.ext
    }));
    if (text) parts.push({ type: 'text', text });
    userMsg = { role: 'user', content: parts };
    displayContent = { images: pendingImages.map(img => img.dataUrl), text };
    clearPendingImages();
  } else {
    userMsg = { role: 'user', content: text };
    displayContent = text;
  }
  conversationHistory.push(userMsg);

  const userIdx = conversationHistory.length - 1;
  const userDiv = addMessage('user', displayContent, userIdx);
  markLatestUnanswered(userDiv);
  // Auto-title on first message
  if (!currentChat.title) {
    currentChat.title = (text || 'Image analysis').slice(0, 60);
  }
  currentChat.messages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
  await saveCurrentChat();
  await addChatToSidebar();

  const shouldAnalyzeOutgoingImages = pendingImages.length === 0 && analyzeImagesBeforeSend && messageHasImages(userMsg);
  if (shouldAnalyzeOutgoingImages) {
    try {
      await analyzeMessageImages(userIdx, { force: false });
    } catch (err) {
      addMessage('error', err?.message || String(err));
      return;
    }
  }

  await streamAssistantResponse({ forceImageDescriptionsForLastUser: shouldAnalyzeOutgoingImages });
}

async function streamAssistantResponse({ forceImageDescriptionsForLastUser = false } = {}) {
  const distToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
  if (distToBottom < 350) autoScrollEnabled = true;
  document.body.classList.add('streaming');
  sendBtn.textContent = 'Stop';

  const generation = {
    stopped: false,
    stopTimer: null,
    finalizeStop: null,
  };
  activeGeneration = generation;

  let thinkingIndicator = null;
  let streamedText = '';
  let assistantDiv = null;
  let rafPending = false;
  let finalized = false;

  function finishStreaming() {
    if (finalized) return;
    finalized = true;
    window.clearTimeout(generation.stopTimer);
    thinkingIndicator?.remove();
    document.body.classList.remove('streaming');
    sendBtn.textContent = 'Send';
    if (activeGeneration === generation) activeGeneration = null;
  }

  generation.finalizeStop = () => {
    generation.stopped = true;
    finishStreaming();
    if (!streamedText && assistantDiv) assistantDiv.remove();
    markLatestUnanswered();
  };

  function renderStreamedMarkdown() {
    rafPending = false;
    if (!assistantDiv || generation.stopped) return;
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

  try {
    await analyzeMissingImagesForTextProjection();
  } catch (err) {
    finishStreaming();
    addMessage('error', err?.message || String(err));
    return;
  }

  thinkingIndicator = createThinkingIndicator();

  const options = {
    model: currentModel,
    systemPrompt: systemPrompt || undefined,
    temperature: currentTemp,
    maxTokens: currentMaxTokens > 0 ? currentMaxTokens : undefined,
  };
  const requestHadImages = conversationHistory.some(messageHasImages);
  const apiMessages = buildApiMessagesForModel(conversationHistory, currentModel, { forceImageDescriptionsForLastUser });
  const requestSentActualImages = apiMessages.some(messageHasImages);

  const result = await window.api.sendMessage(
    apiMessages,
    options,
    (chunk) => {
      if (generation.stopped) return;
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

  if (generation.stopped) return;

  finishStreaming();

  if (result?.error) {
    if (assistantDiv) assistantDiv.remove();
    const imageHint = requestSentActualImages
      ? '\n\nIf this came from image input, set this model to text-only in Settings > Models or switch to a vision-capable model.'
      : '';
    addMessage('error', `Error: ${result.error}${imageHint}`);
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

document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items || document.body.classList.contains('streaming')) return;

  let foundImage = false;
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue;
    if (!foundImage) {
      e.preventDefault();
      foundImage = true;
    }
    const blob = item.getAsFile();
    if (!blob) continue;
    const ext = item.type.split('/')[1].replace('jpeg', 'jpg');
    const reader = new FileReader();
    reader.onload = () => addPendingImage(reader.result, ext);
    reader.readAsDataURL(blob);
  }
});

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
    const generation = activeGeneration;
    if (generation?.stopped) return;
    if (generation) {
      generation.stopped = true;
      generation.stopTimer = window.setTimeout(() => {
        generation.finalizeStop?.();
      }, STOP_GRACE_MS);
    }
    sendBtn.textContent = 'Stopping…';
    window.api.cancelMessage()
      .then(() => generation?.finalizeStop?.())
      .catch(() => generation?.finalizeStop?.());
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
