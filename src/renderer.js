marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return marked.parse(text || '');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const messagesEl        = document.getElementById('messages');
const analysisContainer = document.getElementById('analysis-container');
const appModeTabs       = Array.from(document.querySelectorAll('.app-mode-tab'));
const analysisBackChat  = document.getElementById('analysis-back-chat');
const analysisSourcePath = document.getElementById('analysis-source-path');
const analysisSourceTabs = Array.from(document.querySelectorAll('.analysis-source-tab'));
const analysisImportBtn = document.getElementById('analysis-import-btn');
const analysisDatasetSelect = document.getElementById('analysis-dataset-select');
const analysisRefreshBtn = document.getElementById('analysis-refresh-btn');
const analysisChunkBtn = document.getElementById('analysis-chunk-btn');
const analysisDatasetSummary = document.getElementById('analysis-dataset-summary');
const analysisChunkTarget = document.getElementById('analysis-chunk-target');
const analysisMaxTopics = document.getElementById('analysis-max-topics');
const analysisCallCharLimit = document.getElementById('analysis-call-char-limit');
const analysisDensity = document.getElementById('analysis-density');
const analysisProfile = document.getElementById('analysis-profile');
const analysisTemp = document.getElementById('analysis-temp');
const analysisNewRunBtn = document.getElementById('analysis-new-run-btn');
const analysisRunSelect = document.getElementById('analysis-run-select');
const analysisRunRefreshBtn = document.getElementById('analysis-run-refresh-btn');
const analysisProcessBtn = document.getElementById('analysis-process-btn');
const analysisReprocessBtn = document.getElementById('analysis-reprocess-btn');
const analysisCanonizeBtn = document.getElementById('analysis-canonize-btn');
const analysisRecanonizeBtn = document.getElementById('analysis-recanonize-btn');
const analysisStopBtn = document.getElementById('analysis-stop-btn');
const analysisTestRunBtn = document.getElementById('analysis-test-run-btn');
const analysisTestMode = document.getElementById('analysis-test-mode');
const analysisTestCount = document.getElementById('analysis-test-count');
const analysisTestStart = document.getElementById('analysis-test-start');
const analysisStatusPill = document.getElementById('analysis-status-pill');
const analysisProgressFill = document.getElementById('analysis-progress-fill');
const analysisProgressText = document.getElementById('analysis-progress-text');
const analysisLoading = document.getElementById('analysis-loading');
const analysisLoadingText = document.getElementById('analysis-loading-text');
const analysisMetrics = document.getElementById('analysis-metrics');
const analysisOutputPath = document.getElementById('analysis-output-path');
const analysisOpenOutputBtn = document.getElementById('analysis-open-output-btn');
const analysisOpenRunFolderBtn = document.getElementById('analysis-open-run-folder-btn');
const analysisOpenLogBtn = document.getElementById('analysis-open-log-btn');
const analysisResults = document.getElementById('analysis-results');
const analysisLog = document.getElementById('analysis-log');
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
const reasoningChatToggle = document.getElementById('reasoning-chat-toggle');
const reasoningAnalysisToggle = document.getElementById('reasoning-analysis-toggle');
const reasoningInfoBtn = document.getElementById('reasoning-info-btn');
const reasoningInlineInfo = document.getElementById('reasoning-inline-info');
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
const webSearchToggle   = document.getElementById('web-search-toggle');
const settingsExaKey    = document.getElementById('settings-exa-key');
const settingsExaResults = document.getElementById('settings-exa-results');

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
let requestChatReasoning = localStorage.getItem('requestChatReasoning') === '1';
let requestAnalysisReasoning = localStorage.getItem('requestAnalysisReasoning') === '1';
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
let webSearchEnabled = localStorage.getItem('webSearchEnabled') === '1';
let exaApiKey = localStorage.getItem('exaApiKey') || '';
let exaNumResults = parseInt(localStorage.getItem('exaNumResults') || '5');
let analysisDatasets = [];
let analysisRuns = [];
let activeAnalysisSource = ['anthropic', 'openai'].includes(localStorage.getItem('activeAnalysisSource'))
  ? localStorage.getItem('activeAnalysisSource')
  : 'anthropic';
let activeAnalysisDatasetId = localStorage.getItem(`activeAnalysisDatasetId:${activeAnalysisSource}`) || localStorage.getItem('activeAnalysisDatasetId') || '';
let activeAnalysisRunId = localStorage.getItem(`activeAnalysisRunId:${activeAnalysisSource}`) || localStorage.getItem('activeAnalysisRunId') || '';
let analysisBusy = false;
let analysisModeActive = false;
let reasoningInfoOpen = false;
let analysisStopRequested = false;
let densityChanged = false;
let activeAnalysisLogKind = '';
let activeAnalysisPaths = null;
const analysisJsonModeRejectedKeys = new Set();

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

// ── Web search (Exa) ────────────────────────────────────────────────────────────

if (settingsExaKey) settingsExaKey.value = exaApiKey;
if (settingsExaResults) settingsExaResults.value = exaNumResults;

settingsExaKey?.addEventListener('change', () => {
  exaApiKey = settingsExaKey.value.trim();
  localStorage.setItem('exaApiKey', exaApiKey);
});

settingsExaResults?.addEventListener('change', () => {
  const val = Math.min(10, Math.max(1, parseInt(settingsExaResults.value) || 5));
  exaNumResults = val;
  settingsExaResults.value = val;
  localStorage.setItem('exaNumResults', val);
});

function applyWebSearchToggle() {
  if (!webSearchToggle) return;
  webSearchToggle.classList.toggle('active', webSearchEnabled);
  webSearchToggle.setAttribute('aria-pressed', webSearchEnabled ? 'true' : 'false');
  webSearchToggle.title = `Web search (Exa) — ${webSearchEnabled ? 'on' : 'off'}`;
}

webSearchToggle?.addEventListener('click', () => {
  webSearchEnabled = !webSearchEnabled;
  localStorage.setItem('webSearchEnabled', webSearchEnabled ? '1' : '0');
  applyWebSearchToggle();
  if (webSearchEnabled && !exaApiKey) {
    addMessage('error', 'Web search is on, but no Exa API key is set. Add one in Settings → General.');
  }
});

applyWebSearchToggle();

// ── Data analysis mode ─────────────────────────────────────────────────────────

function setAnalysisMode(enabled) {
  if (analysisModeActive === enabled) {
    for (const tab of appModeTabs) {
      const selected = tab.dataset.mode === (enabled ? 'analysis' : 'chat');
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    renderReasoningInfo();
    return;
  }
  analysisModeActive = enabled;
  reasoningInfoOpen = false;
  analysisContainer?.classList.toggle('hidden', !enabled);
  document.body.classList.toggle('analysis-mode', enabled);
  newChatBtn?.classList.toggle('hidden', enabled);
  for (const tab of appModeTabs) {
    const selected = tab.dataset.mode === (enabled ? 'analysis' : 'chat');
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  renderReasoningInfo();
  if (enabled) {
    setAnalysisLoading(true, 'Loading data analysis workspace...');
    try {
      closeSettings();
    } catch (err) {
      console.error('Failed to close settings before analysis mode:', err);
    }
    setAnalysisStatus('Loading', 0);
    if (analysisProgressText) analysisProgressText.textContent = 'Loading data analysis workspace...';
    Promise.resolve()
      .then(() => new Promise(resolve => requestAnimationFrame(resolve)))
      .then(() => loadAnalysisDatasets())
      .catch((err) => {
      console.error('Failed to load analysis datasets:', err);
      analysisLogLine(`Failed to load datasets: ${err?.message || err}`, 'error');
      setAnalysisStatus('Load failed', 0);
      if (analysisProgressText) analysisProgressText.textContent = 'Data analysis opened, but dataset loading failed.';
    }).finally(() => setAnalysisLoading(false));
  } else {
    setAnalysisLoading(false);
  }
}

function analysisLogLine(text, type = 'info') {
  const line = `[${new Date().toLocaleTimeString()}] ${text}`;
  if (analysisLog) {
    const row = document.createElement('div');
    row.className = `analysis-log-row ${type}`;
    row.textContent = line;
    analysisLog.appendChild(row);
    analysisLog.scrollTop = analysisLog.scrollHeight;
  }
  if (activeAnalysisDatasetId && activeAnalysisRunId && activeAnalysisLogKind) {
    window.api.analysisAppendLog(activeAnalysisDatasetId, activeAnalysisRunId, activeAnalysisLogKind, line)
      .then((res) => {
        if (!activeAnalysisPaths) activeAnalysisPaths = {};
        activeAnalysisPaths[activeAnalysisLogKind === 'test' ? 'testLog' : 'analysisLog'] = res.path;
      })
      .catch(() => {});
  }
}

async function refreshAnalysisPaths() {
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) return null;
  activeAnalysisPaths = await window.api.analysisPaths(activeAnalysisDatasetId, activeAnalysisRunId).catch(() => null);
  return activeAnalysisPaths;
}

function clearAnalysisView(logKind = '') {
  if (analysisLog) analysisLog.innerHTML = '';
  if (analysisResults) analysisResults.innerHTML = '';
  if (analysisMetrics) analysisMetrics.innerHTML = '';
  if (analysisOutputPath) analysisOutputPath.textContent = '';
  activeAnalysisLogKind = logKind;
}

function analysisResultLine(title, details = []) {
  if (!analysisResults) return;
  const row = document.createElement('div');
  row.className = 'analysis-result-row';
  const heading = document.createElement('strong');
  heading.textContent = title;
  row.appendChild(heading);
  for (const detail of details.filter(Boolean)) {
    const span = document.createElement('span');
    span.textContent = detail;
    row.appendChild(span);
  }
  analysisResults.appendChild(row);
}

function setAnalysisStatus(text, pct = null) {
  if (analysisStatusPill) analysisStatusPill.textContent = text;
  if (analysisProgressFill && pct !== null) {
    analysisProgressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
}

function setAnalysisLoading(visible, text = 'Loading analysis workspace...') {
  if (analysisLoadingText) analysisLoadingText.textContent = text;
  analysisLoading?.classList.toggle('hidden', !visible);
}

function resetAnalysisProgress(text = 'No run selected.') {
  setAnalysisStatus('Idle', 0);
  if (analysisProgressText) analysisProgressText.textContent = text;
}

function markAnalysisStopped(text = 'Stopped by user.') {
  analysisStopRequested = true;
  setAnalysisStatus('Stopped', 100);
  if (analysisProgressText) analysisProgressText.textContent = text;
}

function compactNumber(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min ? `${min}m ${sec}s` : `${sec}s`;
}

function estimatedTokenCount(chars) {
  return Math.ceil((Number(chars) || 0) / 3.5);
}

function chunkCharCount(chunk) {
  return Number(chunk?.char_count || chunk?.text?.length || 0);
}

function totalChunkChars(chunks) {
  return (chunks || []).reduce((sum, chunk) => sum + chunkCharCount(chunk), 0);
}

function updateAnalysisMetrics(metrics = {}) {
  if (!analysisMetrics) return;
  const rows = [];
  if (metrics.coverage) {
    rows.push(['Selected chunks', `${metrics.coverage.selectedChunks}/${metrics.coverage.totalChunks} (${metrics.coverage.chunkPct.toFixed(2)}%)`]);
    rows.push(['Selected chars', `${compactNumber(metrics.coverage.selectedChars)}/${compactNumber(metrics.coverage.totalChars)} (${metrics.coverage.charPct.toFixed(2)}%)`]);
    rows.push(['Full corpus scale', `~${metrics.coverage.multiplier.toFixed(1)}x selected chars`]);
  }
  if (metrics.item) rows.push(['Current item', metrics.item]);
  if (metrics.sourceCharCount != null) rows.push(['Source chars', compactNumber(metrics.sourceCharCount)]);
  if (metrics.promptCharCount != null) rows.push(['Prompt', `${compactNumber(metrics.promptCharCount)} chars (~${compactNumber(metrics.estimatedPromptTokens)} tok)`]);
  if (metrics.responseCharCount != null) rows.push(['Response', `${compactNumber(metrics.responseCharCount)} chars (~${compactNumber(metrics.estimatedResponseTokens)} tok)`]);
  if (metrics.durationMs != null) rows.push(['Duration', formatDuration(metrics.durationMs)]);
  if (metrics.phaseElapsedMs != null) rows.push(['Phase elapsed', formatDuration(metrics.phaseElapsedMs)]);
  if (metrics.totalElapsedMs != null) rows.push(['Total elapsed', formatDuration(metrics.totalElapsedMs)]);
  if (metrics.lastPhaseName && metrics.lastPhaseDurationMs != null) rows.push([`${metrics.lastPhaseName} duration`, formatDuration(metrics.lastPhaseDurationMs)]);
  if (metrics.elapsedMs != null && metrics.coverage?.charPct > 0) {
    rows.push(['Projected full stage', formatDuration(metrics.elapsedMs / (metrics.coverage.charPct / 100))]);
  }
  analysisMetrics.innerHTML = rows.map(([label, value]) => (
    `<div><span>${label}</span><strong>${value}</strong></div>`
  )).join('');
}

function startAnalysisMetricsTicker(getMetrics) {
  const timer = window.setInterval(() => updateAnalysisMetrics(getMetrics()), 1000);
  return () => window.clearInterval(timer);
}

const ANALYSIS_PROFILE_DEFAULTS = {
  fast: { chunkTargetChars: '25000', maxTopics: '40', callCharLimit: '30000', density: 'normal', temperature: '0.15' },
  quality: { chunkTargetChars: '18000', maxTopics: '24', callCharLimit: '24000', density: 'rich', temperature: '0.2' }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function applyAnalysisProfileDefaults(profile, force = false) {
  const defaults = ANALYSIS_PROFILE_DEFAULTS[profile] || ANALYSIS_PROFILE_DEFAULTS.fast;
  if (analysisChunkTarget && (force || !analysisChunkTarget.value)) analysisChunkTarget.value = defaults.chunkTargetChars;
  if (analysisMaxTopics && (force || !analysisMaxTopics.value)) analysisMaxTopics.value = defaults.maxTopics;
  if (analysisCallCharLimit && (force || !analysisCallCharLimit.value)) analysisCallCharLimit.value = defaults.callCharLimit;
  if (analysisDensity && (force || !analysisDensity.value)) analysisDensity.value = defaults.density;
  if (analysisTemp && (force || !analysisTemp.value)) analysisTemp.value = defaults.temperature;
  if (force) densityChanged = false;
}

function initAnalysisProfile() {
  if (!analysisProfile) return;
  const saved = localStorage.getItem('analysisProfile') || 'fast';
  analysisProfile.value = ANALYSIS_PROFILE_DEFAULTS[saved] ? saved : 'fast';
  localStorage.setItem('analysisProfile', analysisProfile.value);
  applyAnalysisProfileDefaults(analysisProfile.value, saved !== 'fast');
}

function valueAtPath(value, path) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function findReasoningMetadata(value, depth = 0, path = []) {
  if (!value || depth > 5) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findReasoningMetadata(value[i], depth + 1, [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('reason') || lower.includes('thinking') || lower.includes('thought')) {
      return { path: [...path, key].join('.'), value: nested };
    }
    const found = findReasoningMetadata(nested, depth + 1, [...path, key]);
    if (found) return found;
  }
  return null;
}

function inferReasoningCapability(modelId = currentModel) {
  if (!modelId) {
    return { state: 'unknown', source: 'no model selected', detail: 'Select a model to see reported reasoning metadata.' };
  }
  const info = MODELS[modelId] || {};
  const raw = info.raw || {};
  const directPaths = [
    ['reasoning'],
    ['reasoning_capable'],
    ['supports_reasoning'],
    ['thinking'],
    ['supports_thinking'],
    ['capabilities', 'reasoning'],
    ['capabilities', 'thinking'],
    ['meta', 'reasoning'],
    ['meta', 'reasoning_capable'],
    ['meta', 'supports_reasoning'],
    ['metadata', 'reasoning'],
    ['metadata', 'supports_reasoning']
  ];
  for (const path of directPaths) {
    const value = valueAtPath(raw, path);
    if (value !== undefined && value !== null) {
      if (value === true) return { state: 'reported supported', source: path.join('.'), detail: 'Server metadata explicitly reports reasoning support.' };
      if (value === false) return { state: 'reported not supported', source: path.join('.'), detail: 'Server metadata explicitly reports no reasoning support.' };
      return { state: 'reported metadata present', source: path.join('.'), detail: `${path.join('.')} = ${JSON.stringify(value).slice(0, 90)}` };
    }
  }

  const metadataHit = findReasoningMetadata(raw);
  if (metadataHit) {
    return {
      state: 'reported metadata present',
      source: metadataHit.path,
      detail: `${metadataHit.path} = ${JSON.stringify(metadataHit.value).slice(0, 90)}`
    };
  }

  const id = modelId.toLowerCase();
  if (/(^|[/._-])(o1|o3|o4|gpt-5|deepseek-r1|qwq|reason|reasoning|think|thinking)([/._-]|$)/i.test(id)) {
    return { state: 'likely reasoning model', source: 'model name heuristic', detail: 'The model id contains a common reasoning-model signal.' };
  }
  return { state: 'unknown', source: 'no reasoning metadata found', detail: 'The server did not report a recognizable reasoning capability field.' };
}

function renderReasoningInfo() {
  const report = inferReasoningCapability(currentModel);
  const modelLabel = currentModel ? (currentModel.split('/').pop() || currentModel) : 'none';
  const setButton = (btn, enabled, label) => {
    if (!btn) return;
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = `${label} reasoning: ${enabled ? 'ask on' : 'explicit off'}`;
  };
  setButton(reasoningChatToggle, requestChatReasoning, 'Chat');
  setButton(reasoningAnalysisToggle, requestAnalysisReasoning, 'Data analysis');
  reasoningChatToggle?.classList.toggle('hidden', analysisModeActive);
  reasoningAnalysisToggle?.classList.toggle('hidden', !analysisModeActive);
  reasoningInfoBtn?.classList.toggle('active', reasoningInfoOpen);
  reasoningInfoBtn?.setAttribute('aria-expanded', reasoningInfoOpen ? 'true' : 'false');
  if (reasoningInlineInfo) {
    reasoningInlineInfo.classList.toggle('hidden', !reasoningInfoOpen);
    if (reasoningInfoOpen) {
      const currentMode = analysisModeActive ? 'Analysis' : 'Chat';
      const currentState = analysisModeActive ? requestAnalysisReasoning : requestChatReasoning;
      reasoningInlineInfo.innerHTML = `Model <strong>${escapeHtml(modelLabel)}</strong>: ${escapeHtml(report.state)}. ${currentMode} reasoning <strong>${currentState ? 'ask on' : 'off'}</strong>. Off sends no-thinking hints; model templates may still force thinking.`;
    }
  }
}

function analysisStorageKey(name, source = activeAnalysisSource) {
  return `${name}:${source}`;
}

function analysisSourceLabel(source = activeAnalysisSource) {
  return source === 'openai' ? 'OpenAI' : 'Anthropic';
}

function saveCurrentAnalysisSourceState() {
  localStorage.setItem('activeAnalysisSource', activeAnalysisSource);
  localStorage.setItem(analysisStorageKey('activeAnalysisDatasetId'), activeAnalysisDatasetId || '');
  localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), activeAnalysisRunId || '');
  if (analysisSourcePath) {
    localStorage.setItem(analysisStorageKey('analysisSourcePath'), analysisSourcePath.value || '');
  }
}

function restoreAnalysisSourceState(source) {
  activeAnalysisSource = source;
  activeAnalysisDatasetId = localStorage.getItem(analysisStorageKey('activeAnalysisDatasetId', source)) || '';
  activeAnalysisRunId = localStorage.getItem(analysisStorageKey('activeAnalysisRunId', source)) || '';
  if (analysisSourcePath) {
    analysisSourcePath.value = localStorage.getItem(analysisStorageKey('analysisSourcePath', source)) || '';
    analysisSourcePath.placeholder = source === 'openai'
      ? 'Paste ChatGPT conversations.json or HTML export path...'
      : 'Paste Anthropic / Claude JSON export path...';
  }
  localStorage.setItem('activeAnalysisSource', source);
}

function renderAnalysisSourceTabs() {
  for (const tab of analysisSourceTabs) {
    const selected = tab.dataset.source === activeAnalysisSource;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.disabled = analysisBusy;
  }
}

function setAnalysisBusy(enabled) {
  analysisBusy = enabled;
  renderAnalysisSourceTabs();
}

async function withAnalysisBusy(task) {
  if (analysisBusy) {
    analysisLogLine('Data analysis is already processing.', 'warn');
    return;
  }
  setAnalysisBusy(true);
  try {
    return await task();
  } finally {
    setAnalysisBusy(false);
  }
}

function initAnalysisSourceTabs() {
  restoreAnalysisSourceState(activeAnalysisSource);
  renderAnalysisSourceTabs();
}

function currentAnalysisSettings() {
  const profile = analysisProfile?.value || 'fast';
  const density = analysisDensity?.value || (profile === 'quality' ? 'rich' : 'normal');
  const densityDefaults = profile === 'quality'
    ? { sparse: 10, normal: 18, rich: 30 }
    : { sparse: 25, normal: 40, rich: 50 };
  const requestedTopics = parseInt(analysisMaxTopics?.value || `${densityDefaults[density] || 24}`) || densityDefaults[density] || 24;
  const defaultLimit = Number(ANALYSIS_PROFILE_DEFAULTS[profile]?.callCharLimit || ANALYSIS_PROFILE_DEFAULTS.fast.callCharLimit);
  const callCharLimit = Math.min(30000, Math.max(20000, parseInt(analysisCallCharLimit?.value || `${defaultLimit}`) || defaultLimit));
  const chunkDefault = Number(ANALYSIS_PROFILE_DEFAULTS[profile]?.chunkTargetChars || ANALYSIS_PROFILE_DEFAULTS.fast.chunkTargetChars);
  const maxChunkTarget = Math.max(4000, callCharLimit - 6000);
  return {
    model: currentModel || '',
    analysisProfile: profile,
    maxTopicsPerChunk: Math.min(50, Math.max(3, requestedTopics)),
    topicDensity: density,
    chunkTargetChars: Math.min(25000, maxChunkTarget, Math.max(4000, parseInt(analysisChunkTarget?.value || `${chunkDefault}`) || chunkDefault)),
    llmCallCharLimit: callCharLimit,
    temperature: Math.min(2, Math.max(0, parseFloat(analysisTemp?.value || '0.2') || 0.2)),
    includeCodeBlocks: false,
    responseFormatJson: profile === 'quality',
    fastPromptCharBudget: callCharLimit,
    fastMinPromptCharBudget: 20000,
    fastMaxTokens: 6144,
    deterministicCanonization: profile !== 'quality',
    adapter: 'conversation_export_v1'
  };
}

function renderAnalysisDatasetSummary(dataset) {
  if (!analysisDatasetSummary) return;
  if (!dataset) {
    analysisDatasetSummary.textContent = 'No dataset selected.';
    return;
  }
  const parts = [
    `source: ${dataset.source_format || dataset.adapter || 'unknown'}`,
    `records: ${dataset.record_count ?? 0}`,
    `chunks: ${dataset.chunk_count ?? 0}`,
    `omitted blocks: ${dataset.omitted_code_blocks ?? 0}`,
  ];
  if (dataset.conversation_count != null) {
    parts.splice(1, 0, `conversations: ${dataset.conversation_count}`);
  }
  if (dataset.time_start || dataset.time_end) {
    parts.push(`${dataset.time_start || '?'} -> ${dataset.time_end || '?'}`);
  }
  analysisDatasetSummary.textContent = parts.join(' | ');
}

async function loadAnalysisDatasets() {
  if (!window.api?.analysisList) return;
  setAnalysisLoading(true, `Loading ${analysisSourceLabel()} datasets...`);
  try {
    analysisDatasets = await window.api.analysisList(activeAnalysisSource).catch((err) => {
      analysisLogLine(`Failed to list datasets: ${err?.message || err}`, 'error');
      return [];
    });
    if (!analysisDatasetSelect) return;
    analysisDatasetSelect.innerHTML = '';
    for (const dataset of analysisDatasets) {
      const opt = document.createElement('option');
      opt.value = dataset.dataset_id;
      opt.textContent = `${dataset.dataset_id} (${dataset.record_count || 0} records)`;
      analysisDatasetSelect.appendChild(opt);
    }
    if (activeAnalysisDatasetId && analysisDatasets.some(d => d.dataset_id === activeAnalysisDatasetId)) {
      analysisDatasetSelect.value = activeAnalysisDatasetId;
    } else if (analysisDatasets[0]) {
      activeAnalysisDatasetId = analysisDatasets[0].dataset_id;
      analysisDatasetSelect.value = activeAnalysisDatasetId;
    } else {
      activeAnalysisDatasetId = '';
    }
    localStorage.setItem(analysisStorageKey('activeAnalysisDatasetId'), activeAnalysisDatasetId || '');
    renderAnalysisDatasetSummary(analysisDatasets.find(d => d.dataset_id === activeAnalysisDatasetId));
    await loadAnalysisRuns();
  } finally {
    setAnalysisLoading(false);
  }
}

async function loadAnalysisRuns() {
  if (!analysisRunSelect) return;
  if (!activeAnalysisDatasetId) {
    analysisRuns = [];
    analysisRunSelect.innerHTML = '';
    activeAnalysisRunId = '';
    localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), '');
    resetAnalysisProgress('Import or select a dataset first.');
    return;
  }
  setAnalysisLoading(true, 'Loading analysis runs...');
  try {
    analysisRuns = await window.api.analysisListRuns(activeAnalysisDatasetId).catch((err) => {
      analysisLogLine(`Failed to list runs: ${err?.message || err}`, 'error');
      return [];
    });
    analysisRunSelect.innerHTML = '';
    for (const run of analysisRuns) {
      const opt = document.createElement('option');
      opt.value = run.run_id;
      opt.textContent = `${run.run_id} (${run.processed_count || 0}/${run.chunk_count || 0})`;
      analysisRunSelect.appendChild(opt);
    }
    if (activeAnalysisRunId && analysisRuns.some(r => r.run_id === activeAnalysisRunId)) {
      analysisRunSelect.value = activeAnalysisRunId;
    } else if (analysisRuns[0]) {
      activeAnalysisRunId = analysisRuns[0].run_id;
      analysisRunSelect.value = activeAnalysisRunId;
    } else {
      activeAnalysisRunId = '';
    }
    localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), activeAnalysisRunId || '');
    await refreshAnalysisPaths();
    await refreshAnalysisRunProgress();
  } finally {
    setAnalysisLoading(false);
  }
}

async function refreshAnalysisRunProgress() {
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    resetAnalysisProgress(activeAnalysisDatasetId ? 'No run selected.' : 'Import or select a dataset first.');
    return null;
  }
  const state = await window.api.analysisRunState(activeAnalysisDatasetId, activeAnalysisRunId).catch((err) => {
    analysisLogLine(`Failed to load run state: ${err?.message || err}`, 'error');
    return null;
  });
  if (!state) return null;
  const pct = state.chunk_count ? (state.processed_count / state.chunk_count) * 100 : 0;
  setAnalysisStatus(state.processed_count >= state.chunk_count ? 'Topic pass done' : 'Ready', pct);
  if (analysisProgressText) {
    analysisProgressText.textContent = `${state.processed_count}/${state.chunk_count} chunks processed`;
  }
  return state;
}

function extractJsonObject(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('empty model response');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error('model response was not parseable JSON');
  }
}

function messageCharCount(messages) {
  return (messages || []).reduce((sum, message) => {
    if (typeof message?.content === 'string') return sum + message.content.length;
    return sum + JSON.stringify(message?.content || '').length;
  }, 0);
}

async function runAnalysisModelDetailed(messages, temperature, analysisOptions = {}) {
  if (!currentModel) throw new Error('No model selected.');
  let text = '';
  const maxTokens = analysisOptions.maxTokens ?? (currentMaxTokens > 0 ? currentMaxTokens : undefined);
  const jsonModeKey = `${serverUrl}::${currentModel || ''}`;
  const requestedJsonMode = analysisOptions.responseFormatJson === true;
  const responseFormatJson = requestedJsonMode && !analysisJsonModeRejectedKeys.has(jsonModeKey);
  const promptCharCount = messageCharCount(messages);
  const startedAt = performance.now();
  const result = await window.api.sendMessage(
    messages,
    {
      model: currentModel,
      temperature,
      maxTokens,
      responseFormatJson,
      reasoningRequested: requestAnalysisReasoning,
    },
    (chunk) => { text += chunk; }
  );
  if (result?.error && responseFormatJson) {
    analysisJsonModeRejectedKeys.add(jsonModeKey);
    analysisLogLine('JSON response mode was rejected by this server/model; disabling it for the rest of this app session.', 'warn');
    return runAnalysisModelDetailed(messages, temperature, { ...analysisOptions, responseFormatJson: false });
  }
  if (result?.error) throw new Error(result.error);
  if (result?.cancelled) throw new Error('cancelled');
  if (result?.reasoningFallback) {
    analysisLogLine('Reasoning controls were rejected by this server/model; this data-analysis request was retried without them.', 'warn');
  }
  const finalText = text || result?.content || '';
  const durationMs = Math.round(performance.now() - startedAt);
  return {
    text: finalText,
    metrics: {
      model: currentModel || '',
      prompt_char_count: promptCharCount,
      response_char_count: finalText.length,
      estimated_prompt_tokens: estimatedTokenCount(promptCharCount),
      estimated_response_tokens: estimatedTokenCount(finalText.length),
      duration_ms: durationMs,
      max_tokens: maxTokens || null,
      response_format_json_requested: requestedJsonMode,
      response_format_json_used: responseFormatJson,
      reasoning_requested: requestAnalysisReasoning,
      reasoning_fallback_used: result?.reasoningFallback === true,
      created_at: new Date().toISOString()
    }
  };
}

async function runAnalysisModel(messages, temperature, analysisOptions = {}) {
  const result = await runAnalysisModelDetailed(messages, temperature, analysisOptions);
  return result.text;
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeConceptId(value) {
  const clean = String(value || 'concept')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return clean || `concept_${hashString(value).slice(0, 6)}`;
}

function truncateForPrompt(value, max = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactStringArray(values, maxItems = 4, maxChars = 80) {
  if (!Array.isArray(values)) return [];
  return values
    .filter(Boolean)
    .slice(0, maxItems)
    .map(v => truncateForPrompt(v, maxChars));
}

async function parseAnalysisJsonWithRepair(raw, contextLabel, schemaHint) {
  try {
    return extractJsonObject(raw);
  } catch (firstErr) {
    analysisLogLine(`${contextLabel} returned malformed JSON; attempting repair.`, 'warn');
    const repairRaw = await runAnalysisModel([
      {
        role: 'system',
        content: 'You repair malformed JSON. Return only valid JSON. Do not add markdown, commentary, or new information.'
      },
      {
        role: 'user',
        content: `Repair this malformed JSON so it parses cleanly. Preserve the original data and shape as much as possible.

Expected shape:
${schemaHint}

Parser error:
${firstErr.message}

Malformed JSON:
${raw}`
      }
    ], 0, { maxTokens: 8192, responseFormatJson: true });
    try {
      return extractJsonObject(repairRaw);
    } catch (repairErr) {
      const err = new Error(`${contextLabel} JSON parse failed after repair: ${repairErr.message}. Original error: ${firstErr.message}`);
      err.rawResponse = raw;
      err.repairResponse = repairRaw;
      throw err;
    }
  }
}

function topicExtractionPrompt(chunk, settings) {
  const densityGuide = {
    sparse: 'Extract only the strongest recurring themes.',
    normal: 'Extract a balanced set of recurring and specific topics.',
    rich: 'Extract a rich, high-recall set of distinct topics, subtopics, motifs, project ideas, values, tensions, and user intents.'
  }[settings.topicDensity || 'rich'];
  return `You are analyzing a chronological conversation export chunk for a later concept-map app.

Return ONLY valid JSON with this shape:
{
  "chunk_id": "${chunk.chunk_id}",
  "time_start": "${chunk.time_start || ''}",
  "time_end": "${chunk.time_end || ''}",
  "topics": [
    {
      "label": "short topic label",
      "summary": "one or two sentence topic summary",
      "level": "macro | topic | subtopic | motif",
      "parent_label": "broader parent topic if useful",
      "aliases": ["similar phrasings"],
      "subtopics": ["optional subtopic"],
      "evidence_record_ids": ["record ids from the chunk"],
      "confidence": 0.0
    }
  ],
  "events": [
    {
      "timestamp": "ISO timestamp if available",
      "summary": "timeline-relevant conceptual event",
      "record_ids": ["record ids"]
    }
  ]
}

Rules:
- Discovery mode: ${densityGuide}
- Extract conceptual/user-intent topics, not every sentence, but prefer specificity over over-compression.
- Code/output blocks may be omitted; do not reconstruct omitted code.
- User prompts around code are valuable; generated code bodies are not.
- Do not merge distinct sibling topics into one parent. A parent can exist, but children should remain separate topics.
- Include project/app ideas, recurring technical problems, philosophical themes, emotional arcs, political/social concepts, and self-model changes when present.
- Prefer distinct useful topics over generic grand themes.
- Max topics: ${settings.maxTopicsPerChunk}.

Chunk text:
${chunk.text}`;
}

function fastTopicExtractionPrompt(chunks, settings) {
  const densityGuide = {
    sparse: 'Extract only the strongest recurring themes.',
    normal: 'Extract a compact balanced set of recurring and specific topics.',
    rich: 'Extract a high-recall set of useful topics, but keep each line short.'
  }[settings.topicDensity || 'normal'];
  const includeEvents = settings.analysisProfile === 'fast' && settings.topicDensity === 'rich';
  const chunkBlocks = chunks.map(chunk => (
    `CHUNK ${chunk.chunk_id}
TIME ${chunk.time_start || ''} TO ${chunk.time_end || ''}
RECORDS ${(chunk.record_ids || []).slice(0, 40).join(',')}
TEXT
${chunk.text}
END CHUNK ${chunk.chunk_id}`
  )).join('\n\n');
  return `Analyze these chronological conversation chunks for a later concept-map app.

Return plain text lines only. Do not return JSON. Do not use markdown.
Use exactly these pipe-delimited formats:
TOPIC|chunk_id|level|label|parent_label|summary|record_id1,record_id2
${includeEvents ? 'EVENT|chunk_id|timestamp|summary|record_id1,record_id2' : ''}

Rules:
- Discovery mode: ${densityGuide}
- Max TOPIC lines per chunk: ${settings.maxTopicsPerChunk}.
- Valid levels: macro, topic, subtopic, motif.
- Keep labels under 6 words.
- Keep summaries under 12 words.
- Use record ids from the chunk when visible. If none are clear, leave the last field empty.
- Do not put the pipe character inside fields.
- Prefer broad useful coverage over detail. Every chunk should get at least 1 TOPIC line unless it is empty.
- User prompts around code are valuable; generated code bodies are not.
${includeEvents ? '- EVENT lines are optional; include only major timeline-relevant events.' : '- Do not output EVENT lines.'}

Chunks:
${chunkBlocks}`;
}

function sanitizeFastField(value, max = 300) {
  return String(value || '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseFastRecordIds(value) {
  return String(value || '')
    .split(',')
    .map(v => sanitizeFastField(v, 80))
    .filter(Boolean)
    .slice(0, 6);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blankTopicResultForChunk(chunk) {
  return {
    chunk_id: chunk.chunk_id,
    time_start: chunk.time_start,
    time_end: chunk.time_end,
    topics: [],
    events: []
  };
}

function parseFastTopicLines(raw, chunks) {
  const byChunk = new Map((chunks || []).map(chunk => [chunk.chunk_id, blankTopicResultForChunk(chunk)]));
  const errors = [];
  const validChunkIds = new Set(byChunk.keys());
  const singleChunkId = validChunkIds.size === 1 ? [...validChunkIds][0] : '';
  const chunkPattern = [...validChunkIds].map(escapeRegExp).join('|');
  const levelPattern = '(?:macro|topic|subtopic|motif)';
  let normalizedRaw = String(raw || '');
  if (chunkPattern) {
    const malformedRows = [];
    const withoutEchoedHeader = normalizedRaw.replace(/TOPIC\|chunk_id\|level\|label\|parent_label\|summary\|record_id1,record_id2/gi, '');
    const malformedRowPattern = new RegExp(`(?:^|\\s)([^|\\n]{1,120})\\|(${chunkPattern})\\|(${levelPattern})\\|([^|\\n]{1,120})\\|([^|\\n]{0,120})\\|([^|\\n]{1,260})\\|([^|\\n]*?)(?=\\s+[^|\\n]{1,120}\\|(?:${chunkPattern})\\|${levelPattern}\\||\\s+TOPIC\\|(?:${chunkPattern})\\|${levelPattern}\\||$)`, 'gi');
    withoutEchoedHeader.replace(malformedRowPattern, (_match, _category, chunkId, level, label, parentLabel, summary, recordIds) => {
      malformedRows.push(`TOPIC|${chunkId}|${level}|${label}|${parentLabel}|${summary}|${String(recordIds || '').trim()}`);
      return '';
    });
    const validRawRows = withoutEchoedHeader
      .replace(new RegExp(`\\s+(?=TOPIC\\|(?:${chunkPattern})\\|${levelPattern}\\|)`, 'gi'), '\n')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^(TOPIC|EVENT)\|/i.test(line));
    normalizedRaw = [...validRawRows, ...malformedRows].join('\n');
  }
  const lines = normalizedRaw.split(/\r?\n/);
  for (const originalLine of lines) {
    const line = originalLine
      .trim()
      .replace(/^```(?:\w+)?\s*$/i, '')
      .replace(/^[\s>*-]*(?:\d+[.)]\s*)?/, '')
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .replace(/\s*\|\s*/g, '|');
    if (!line) continue;
    let parts = line.split('|').map(part => part.trim());
    let kind = parts[0]?.toUpperCase();
    if (kind !== 'TOPIC' && kind !== 'EVENT') {
      const maybeChunkId = sanitizeFastField(parts[1], 80);
      const maybeLevel = sanitizeFastField(parts[2], 24).toLowerCase();
      if (validChunkIds.has(maybeChunkId) && ['macro', 'topic', 'subtopic', 'motif'].includes(maybeLevel)) {
        parts = ['TOPIC', parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]];
        kind = 'TOPIC';
      } else {
        continue;
      }
    }
    const chunkId = sanitizeFastField(parts[1], 80);
    if (chunkId.toLowerCase() === 'chunk_id') continue;
    const result = byChunk.get(chunkId);
    if (!result) {
      if (singleChunkId && (/^chunk[_ -]?\d+$/i.test(chunkId) || /^\d+$/.test(chunkId) || /^(chunk|current_chunk|this_chunk)$/i.test(chunkId))) {
        parts[1] = singleChunkId;
      } else {
        errors.push({ line: originalLine, error: 'unknown_chunk_id' });
        continue;
      }
    }
    const target = byChunk.get(parts[1]) || result;
    if (kind === 'TOPIC') {
      const label = sanitizeFastField(parts[3], 120);
      if (!label) {
        errors.push({ line: originalLine, error: 'missing_topic_label' });
        continue;
      }
      target.topics.push({
        label,
        level: sanitizeFastField(parts[2] || 'topic', 24).toLowerCase() || 'topic',
        parent_label: sanitizeFastField(parts[4], 120),
        summary: sanitizeFastField(parts[5] || label, 260),
        aliases: [],
        subtopics: [],
        evidence_record_ids: parseFastRecordIds(parts[6]),
        confidence: 0.65
      });
    } else if (kind === 'EVENT') {
      const summary = sanitizeFastField(parts[3], 260);
      if (!summary) {
        errors.push({ line: originalLine, error: 'missing_event_summary' });
        continue;
      }
      target.events.push({
        timestamp: sanitizeFastField(parts[2], 60),
        summary,
        record_ids: parseFastRecordIds(parts[4])
      });
    }
  }
  return {
    results: [...byChunk.values()],
    errors
  };
}

function countFastTopics(results) {
  return (results || []).reduce((sum, result) => sum + (result.topics || []).length, 0);
}

function previewForLog(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function fastTopicRepairPrompt(chunk, rawResponse, settings) {
  return `The previous answer produced no usable TOPIC lines for chunk ${chunk.chunk_id}.

Return only corrected pipe-delimited lines using this exact chunk id:
${chunk.chunk_id}

Valid format:
TOPIC|${chunk.chunk_id}|level|label|parent_label|summary|record_id1,record_id2

Rules:
- Return 1 to ${settings.maxTopicsPerChunk} TOPIC lines.
- Do not echo the header.
- Do not use markdown, JSON, tables, bullets, or explanations.
- Valid levels: macro, topic, subtopic, motif.
- Keep labels under 6 words and summaries under 12 words.
- Use record ids from the chunk when visible. If none are clear, leave the last field empty.

Previous answer:
${String(rawResponse || '').slice(0, 3000)}

Chunk:
CHUNK ${chunk.chunk_id}
TIME ${chunk.time_start || ''} TO ${chunk.time_end || ''}
RECORDS ${(chunk.record_ids || []).slice(0, 40).join(',')}
TEXT
${chunk.text}
END CHUNK ${chunk.chunk_id}`;
}

function compactTopicResult(r) {
  return {
    chunk_id: r.chunk_id,
    time_start: r.time_start,
    time_end: r.time_end,
    topics: (r.topics || []).slice(0, 35).map(t => ({
      label: truncateForPrompt(t.label, 90),
      summary: truncateForPrompt(t.summary, 260),
      level: truncateForPrompt(t.level, 24),
      parent_label: truncateForPrompt(t.parent_label, 90),
      aliases: compactStringArray(t.aliases, 3, 70),
      subtopics: compactStringArray(t.subtopics, 5, 80),
      evidence_record_ids: compactStringArray(t.evidence_record_ids, 4, 60),
      confidence: typeof t.confidence === 'number' ? t.confidence : undefined
    })),
    events: (r.events || []).slice(0, 10).map(e => ({
      timestamp: truncateForPrompt(e.timestamp, 40),
      summary: truncateForPrompt(e.summary, 220),
      record_ids: compactStringArray(e.record_ids, 3, 60)
    }))
  };
}

function compactGraphFragment(graph) {
  return {
    batch_id: graph._batch_id || graph.batch_id || graph.graph_id || '',
    concepts: (graph.concepts || []).slice(0, 220).map(c => ({
      concept_id: truncateForPrompt(c.concept_id, 80),
      canonical_label: truncateForPrompt(c.canonical_label, 100),
      level: truncateForPrompt(c.level, 24),
      parent_id: truncateForPrompt(c.parent_id, 80),
      aliases: compactStringArray(c.aliases, 5, 80),
      summary: truncateForPrompt(c.summary, 320),
      subtopics: compactStringArray(c.subtopics, 8, 90),
      evidence: (c.evidence || []).slice(0, 4).map(ev => ({
        chunk_id: truncateForPrompt(ev.chunk_id, 40),
        record_ids: compactStringArray(ev.record_ids, 3, 60)
      }))
    })),
    events: (graph.events || []).slice(0, 180).map(e => ({
      event_id: truncateForPrompt(e.event_id, 80),
      timestamp: truncateForPrompt(e.timestamp, 40),
      concept_ids: compactStringArray(e.concept_ids, 5, 80),
      summary: truncateForPrompt(e.summary, 240)
    })),
    edges: (graph.edges || []).slice(0, 260).map(edge => ({
      source: truncateForPrompt(edge.source, 80),
      target: truncateForPrompt(edge.target, 80),
      relationship: truncateForPrompt(edge.relationship, 40),
      weight: typeof edge.weight === 'number' ? edge.weight : undefined
    }))
  };
}

function uniqueTopicResults(results) {
  const byChunk = new Map();
  for (const result of results || []) {
    if (!result?.chunk_id) continue;
    byChunk.set(result.chunk_id, result);
  }
  return [...byChunk.values()].sort((a, b) => String(a.chunk_id).localeCompare(String(b.chunk_id)));
}

function splitByPromptBudget(items, maxChars, stringifyItem) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const item of items) {
    const size = stringifyItem(item).length + 2;
    if (current.length && currentChars + size > maxChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function canonBatchId(kind, index, items, stringifyItem) {
  const digest = hashString(items.map(stringifyItem).join('\n')).slice(0, 8);
  return `c4_${kind}_${String(index).padStart(4, '0')}_${digest}`;
}

function normalizeGraph(graph, fallbackId) {
  const normalized = graph && typeof graph === 'object' ? graph : {};
  normalized.schema_version = normalized.schema_version || '0.1.0';
  normalized.concepts = Array.isArray(normalized.concepts) ? normalized.concepts : [];
  normalized.events = Array.isArray(normalized.events) ? normalized.events : [];
  normalized.edges = Array.isArray(normalized.edges) ? normalized.edges : [];
  normalized.graph_id = normalized.graph_id || fallbackId;
  return normalized;
}

function fallbackGraphFromTopicBatch(datasetId, runId, batchId, batch) {
  const concepts = new Map();
  const events = [];
  for (const result of batch.map(compactTopicResult)) {
    for (const topic of result.topics || []) {
      const label = topic.label || 'Untitled concept';
      const conceptId = normalizeConceptId(label);
      const existing = concepts.get(conceptId) || {
        concept_id: conceptId,
        canonical_label: label,
        level: topic.level || 'topic',
        parent_id: topic.parent_label ? normalizeConceptId(topic.parent_label) : '',
        aliases: [],
        summary: topic.summary || label,
        subtopics: [],
        evidence: []
      };
      existing.aliases = [...new Set([...existing.aliases, ...(topic.aliases || [])])].slice(0, 5);
      existing.subtopics = [...new Set([...existing.subtopics, ...(topic.subtopics || [])])].slice(0, 7);
      if (topic.evidence_record_ids?.length) {
        existing.evidence.push({
          chunk_id: result.chunk_id,
          record_ids: topic.evidence_record_ids.slice(0, 3)
        });
        existing.evidence = existing.evidence.slice(0, 3);
      }
      concepts.set(conceptId, existing);
    }
    for (const event of result.events || []) {
      events.push({
        event_id: normalizeConceptId(`${result.chunk_id}_${event.timestamp || events.length}`),
        timestamp: event.timestamp || result.time_start || '',
        concept_ids: [],
        summary: event.summary || ''
      });
      if (events.length >= 18) break;
    }
  }
  return {
    schema_version: '0.1.0',
    dataset: { id: datasetId, run_id: runId },
    graph_id: batchId,
    batch_id: batchId,
    concepts: [...concepts.values()].slice(0, 80),
    events: events.slice(0, 100),
    edges: [],
    generated_at: new Date().toISOString(),
    fallback: true,
    fallback_reason: 'model_json_failed'
  };
}

function fallbackGraphFromFragments(datasetId, runId, batchId, fragments) {
  const concepts = new Map();
  const events = [];
  const edges = [];
  for (const fragment of fragments.map(compactGraphFragment)) {
    for (const concept of fragment.concepts || []) {
      const label = concept.canonical_label || concept.concept_id || 'Untitled concept';
      const conceptId = normalizeConceptId(concept.concept_id || label);
      const existing = concepts.get(conceptId) || {
        concept_id: conceptId,
        canonical_label: label,
        level: concept.level || 'topic',
        parent_id: concept.parent_id || '',
        aliases: [],
        summary: concept.summary || label,
        subtopics: [],
        evidence: []
      };
      existing.aliases = [...new Set([...existing.aliases, ...(concept.aliases || [])])].slice(0, 6);
      existing.subtopics = [...new Set([...existing.subtopics, ...(concept.subtopics || [])])].slice(0, 10);
      existing.evidence = [...existing.evidence, ...(concept.evidence || [])].slice(0, 5);
      concepts.set(conceptId, existing);
    }
    events.push(...(fragment.events || []));
    edges.push(...(fragment.edges || []));
  }
  return {
    schema_version: '0.1.0',
    dataset: { id: datasetId, run_id: runId },
    graph_id: batchId,
    batch_id: batchId,
    concepts: [...concepts.values()].slice(0, 300),
    events: events.slice(0, 320),
    edges: edges.slice(0, 360),
    generated_at: new Date().toISOString(),
    fallback: true,
    fallback_reason: 'model_json_failed'
  };
}

function aggregateGraphMetrics(graphs) {
  const metrics = (graphs || []).map(g => g?.metrics).filter(Boolean);
  return {
    graph_count: graphs?.length || 0,
    prompt_char_count: metrics.reduce((sum, m) => sum + (Number(m.prompt_char_count) || 0), 0),
    response_char_count: metrics.reduce((sum, m) => sum + (Number(m.response_char_count) || 0), 0),
    estimated_prompt_tokens: metrics.reduce((sum, m) => sum + (Number(m.estimated_prompt_tokens) || 0), 0),
    estimated_response_tokens: metrics.reduce((sum, m) => sum + (Number(m.estimated_response_tokens) || 0), 0),
    duration_ms: metrics.reduce((sum, m) => sum + (Number(m.duration_ms) || 0), 0),
    fallback_count: (graphs || []).filter(g => g?.fallback).length
  };
}

function graphSchemaInstruction(datasetId, runId) {
  return `Return ONLY minified valid JSON. No markdown. No comments. No trailing commas.
{
  "schema_version": "0.1.0",
  "dataset": { "id": "${datasetId}", "run_id": "${runId}" },
  "graph_id": "short batch or merge id",
  "concepts": [
    {
      "concept_id": "stable_snake_case_id",
      "canonical_label": "main topic",
      "level": "macro | topic | subtopic | motif",
      "parent_id": "optional broader concept_id",
      "aliases": ["merged similar labels"],
      "summary": "concept summary",
      "subtopics": ["clustered subtopics"],
      "evidence": [{"chunk_id": "...", "record_ids": ["..."]}]
    }
  ],
  "events": [
    {
      "event_id": "stable_snake_case_id",
      "timestamp": "ISO timestamp if available",
      "concept_ids": ["..."],
      "summary": "timeline event"
    }
  ],
  "edges": [
    {
      "source": "concept_id",
      "target": "concept_id",
      "relationship": "supports | contrasts | develops | related",
      "weight": 0.0
    }
  ]
}`;
}

function canonizationBatchPrompt(datasetId, runId, batchId, results) {
  const compact = results.map(compactTopicResult);
  return `Canonize this batch of chunk-level topic extraction results into graph JSON for a concept-map app.

${graphSchemaInstruction(datasetId, runId)}

Batch id: ${batchId}

Canonization rules:
- Merge similar/duplicate topics into one canonical concept.
- Put narrower repeated variations under subtopics.
- Do not create separate concepts just because labels differ.
- Preserve distinct sibling topics. A broad parent concept should not replace its children.
- Use level and parent_id to keep macro/topic/subtopic/motif hierarchy visible.
- Preserve evidence references.
- Keep IDs stable, lowercase snake_case, and readable.
- Prefer compact summaries; this graph will be merged with other batch graphs later.
- Output caps: max 80 concepts, max 100 events, max 120 edges.
- Per concept: max 5 aliases, max 7 subtopics, max 3 evidence objects.
- For small/test batches, preserving 50-100 distinct useful concepts is acceptable when the input supports it.
- Use short strings. Summaries should usually be one sentence.

Chunk topic results:
${JSON.stringify(compact)}`;
}

function canonizationMergePrompt(datasetId, runId, batchId, fragments) {
  const compact = fragments.map(compactGraphFragment);
  return `Merge these already-canonized graph fragments into a smaller canonical concept graph.

${graphSchemaInstruction(datasetId, runId)}

Merge id: ${batchId}

Merge rules:
- Merge concepts that mean the same thing even if labels differ.
- Preserve useful aliases, subtopics, evidence, and timeline events.
- Preserve distinct sibling topics; do not collapse a child into a parent unless it is only a duplicate phrasing.
- Use level and parent_id to keep hierarchy visible.
- Collapse duplicate or near-duplicate events.
- Keep edges only when they add useful concept-map structure.
- Keep concept IDs stable, lowercase snake_case, and readable.
- Prefer one strong canonical concept over several duplicate phrasings, but keep distinct child concepts.
- Output caps: max 300 concepts, max 320 events, max 360 edges.
- Per concept: max 6 aliases, max 10 subtopics, max 5 evidence objects.
- Use short strings. Do not include long excerpts.

Graph fragments:
${JSON.stringify(compact)}`;
}

function selectAnalysisTestChunks(chunks) {
  const count = Math.min(chunks.length, Math.max(1, parseInt(analysisTestCount?.value || '5') || 5));
  const mode = analysisTestMode?.value || 'random';
  const start = Math.max(0, parseInt(analysisTestStart?.value || '0') || 0);
  if (mode === 'first') return chunks.slice(0, count);
  if (mode === 'around') {
    const half = Math.floor(count / 2);
    const from = Math.max(0, Math.min(chunks.length - count, start - half));
    return chunks.slice(from, from + count);
  }
  const keyed = chunks
    .map(chunk => ({ chunk, sort: hashString(`${chunk.chunk_id}:${Date.now()}:${Math.random()}`) }))
    .sort((a, b) => a.sort.localeCompare(b.sort));
  return keyed.slice(0, count).map(item => item.chunk).sort((a, b) => String(a.chunk_id).localeCompare(String(b.chunk_id)));
}

function analysisCoverage(selectedChunks, allChunks) {
  const selectedChars = totalChunkChars(selectedChunks);
  const totalChars = totalChunkChars(allChunks);
  const selectedCount = selectedChunks.length;
  const totalCount = allChunks.length;
  const chunkPct = totalCount ? (selectedCount / totalCount) * 100 : 0;
  const charPct = totalChars ? (selectedChars / totalChars) * 100 : 0;
  return {
    selectedChunks: selectedCount,
    totalChunks: totalCount,
    selectedChars,
    totalChars,
    chunkPct,
    charPct,
    multiplier: charPct > 0 ? 100 / charPct : 0
  };
}

function splitChunksForFastPrompts(chunks, settings) {
  const maxChars = Math.max(20000, settings.llmCallCharLimit || settings.fastPromptCharBudget || 65000);
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const chunk of chunks || []) {
    const size = chunkCharCount(chunk) + 500;
    if (current.length && currentChars + size > maxChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(chunk);
    currentChars += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function splitTextForLimit(text, maxChars) {
  const raw = String(text || '');
  if (raw.length <= maxChars) return [raw];
  const parts = [];
  let cursor = 0;
  while (cursor < raw.length) {
    let end = Math.min(raw.length, cursor + maxChars);
    if (end < raw.length) {
      const newline = raw.lastIndexOf('\n\n', end);
      if (newline > cursor + Math.floor(maxChars * 0.55)) end = newline + 2;
    }
    parts.push(raw.slice(cursor, end).trim());
    cursor = end;
  }
  return parts.filter(Boolean);
}

function prepareFastWorkChunks(chunks, settings) {
  const limit = settings.llmCallCharLimit || settings.fastPromptCharBudget || 65000;
  const textBudget = Math.max(8000, limit - 3500);
  const workChunks = [];
  const aggregates = new Map();
  for (const chunk of chunks || []) {
    const onePromptLength = fastTopicExtractionPrompt([chunk], settings).length + 120;
    const parts = onePromptLength <= limit
      ? [String(chunk.text || '')]
      : splitTextForLimit(chunk.text || '', textBudget);
    aggregates.set(chunk.chunk_id, {
      original: chunk,
      expected: parts.length,
      received: 0,
      topics: [],
      events: [],
      promptCharCount: 0,
      responseCharCount: 0,
      estimatedPromptTokens: 0,
      estimatedResponseTokens: 0,
      durationMs: 0,
      callCount: 0,
      splitCount: 0
    });
    for (let i = 0; i < parts.length; i++) {
      const partId = parts.length === 1
        ? chunk.chunk_id
        : `${chunk.chunk_id}__part_${String(i + 1).padStart(3, '0')}`;
      workChunks.push({
        ...chunk,
        chunk_id: partId,
        original_chunk_id: chunk.chunk_id,
        segment_index: i + 1,
        segment_count: parts.length,
        char_count: parts[i].length,
        input_hash: `${chunk.input_hash || hashString(chunk.text || '')}:${i + 1}`,
        text: parts[i]
      });
    }
  }
  return { workChunks, aggregates };
}

function aggregateFastBatchMetrics(items) {
  const metrics = items.map(item => item?.metrics).filter(Boolean);
  return {
    prompt_char_count: metrics.reduce((sum, m) => sum + (Number(m.prompt_char_count) || 0), 0),
    response_char_count: metrics.reduce((sum, m) => sum + (Number(m.response_char_count) || 0), 0),
    estimated_prompt_tokens: metrics.reduce((sum, m) => sum + (Number(m.estimated_prompt_tokens) || 0), 0),
    estimated_response_tokens: metrics.reduce((sum, m) => sum + (Number(m.estimated_response_tokens) || 0), 0),
    duration_ms: metrics.reduce((sum, m) => sum + (Number(m.duration_ms) || 0), 0),
    model: currentModel || '',
    max_tokens: metrics.reduce((max, m) => Math.max(max, Number(m.max_tokens) || 0), 0) || null,
    response_format_json_requested: false,
    response_format_json_used: false,
    created_at: new Date().toISOString()
  };
}

async function runFastTopicBatchAdaptive(batch, settings, batchId, depth = 0) {
  const prompt = fastTopicExtractionPrompt(batch, settings);
  const limit = settings.llmCallCharLimit || settings.fastPromptCharBudget || 65000;
  if (prompt.length > limit && batch.length > 1) {
    analysisLogLine(`${batchId}: estimated prompt ${compactNumber(prompt.length)} chars exceeds LLM call limit ${compactNumber(limit)}; splitting before send.`, 'warn');
    const mid = Math.ceil(batch.length / 2);
    const left = await runFastTopicBatchAdaptive(batch.slice(0, mid), settings, `${batchId}a`, depth + 1);
    const right = await runFastTopicBatchAdaptive(batch.slice(mid), settings, `${batchId}b`, depth + 1);
    return {
      results: [...left.results, ...right.results],
      errors: [...left.errors, ...right.errors],
      metrics: aggregateFastBatchMetrics([left, right]),
      callCount: left.callCount + right.callCount,
      splitCount: left.splitCount + right.splitCount + 1
    };
  }
  if (prompt.length > limit) {
    analysisLogLine(`${batchId}: single chunk prompt ${compactNumber(prompt.length)} chars exceeds LLM call limit ${compactNumber(limit)}. Rebuild chunks at or below ${compactNumber(Math.max(4000, limit - 6000))} chars for a strict cap.`, 'warn');
  }
  const messages = [
    { role: 'system', content: 'Return only compact pipe-delimited TOPIC lines. No JSON. No markdown.' },
    { role: 'user', content: prompt }
  ];
  try {
    const modelResult = await runAnalysisModelDetailed(messages, Math.min(0.15, settings.temperature), {
      maxTokens: settings.fastMaxTokens || 6144,
      responseFormatJson: false
    });
    const parsed = parseFastTopicLines(modelResult.text, batch);
    const topicCount = countFastTopics(parsed.results);
    const missingChunks = parsed.results.filter(result => !(result.topics || []).length);
    const missingRatio = batch.length ? missingChunks.length / batch.length : 0;
    if (batch.length > 1 && (topicCount === 0 || missingRatio > 0.4)) {
      analysisLogLine(`${batchId}: model under-filled a ${batch.length}-chunk batch; splitting for coverage.`, 'warn');
      const mid = Math.ceil(batch.length / 2);
      const left = await runFastTopicBatchAdaptive(batch.slice(0, mid), settings, `${batchId}a`, depth + 1);
      const right = await runFastTopicBatchAdaptive(batch.slice(mid), settings, `${batchId}b`, depth + 1);
      return {
        results: [...left.results, ...right.results],
        errors: [...left.errors, ...right.errors],
        metrics: aggregateFastBatchMetrics([left, right]),
        callCount: left.callCount + right.callCount,
        splitCount: left.splitCount + right.splitCount + 1
      };
    }
    if (batch.length === 1 && topicCount === 0) {
      analysisLogLine(`${batchId}: model returned no usable topics for ${batch[0].chunk_id}; requesting corrected pipe lines.`, 'warn');
      const repairMessages = [
        { role: 'system', content: 'Return only corrected TOPIC pipe lines. No markdown. No JSON. No explanations.' },
        { role: 'user', content: fastTopicRepairPrompt(batch[0], modelResult.text, settings) }
      ];
      const repairResult = await runAnalysisModelDetailed(repairMessages, Math.min(0.1, settings.temperature), {
        maxTokens: Math.min(settings.fastMaxTokens || 6144, 2048),
        responseFormatJson: false
      });
      const repaired = parseFastTopicLines(repairResult.text, batch);
      const repairedTopicCount = countFastTopics(repaired.results);
      const metrics = aggregateFastBatchMetrics([
        { metrics: modelResult.metrics },
        { metrics: repairResult.metrics }
      ]);
      if (repairedTopicCount > 0) {
        return {
          results: repaired.results,
          errors: repaired.errors,
          metrics,
          callCount: 2,
          splitCount: 0
        };
      }
      return {
        results: repaired.results,
        errors: [
          ...parsed.errors,
          ...repaired.errors,
          {
            error: 'zero_topics_after_repair',
            chunk_id: batch[0].chunk_id,
            raw_preview: previewForLog(modelResult.text),
            repair_preview: previewForLog(repairResult.text)
          }
        ],
        metrics,
        callCount: 2,
        splitCount: 0
      };
    }
    return {
      results: parsed.results,
      errors: parsed.errors,
      metrics: modelResult.metrics,
      callCount: 1,
      splitCount: 0
    };
  } catch (err) {
    const tooLarge = batch.length > 1;
    if (tooLarge) {
      analysisLogLine(`${batchId}: large batch failed (${err?.message || err}); splitting and retrying.`, 'warn');
      const mid = Math.ceil(batch.length / 2);
      const left = await runFastTopicBatchAdaptive(batch.slice(0, mid), settings, `${batchId}a`, depth + 1);
      const right = await runFastTopicBatchAdaptive(batch.slice(mid), settings, `${batchId}b`, depth + 1);
      return {
        results: [...left.results, ...right.results],
        errors: [...left.errors, ...right.errors],
        metrics: aggregateFastBatchMetrics([left, right]),
        callCount: left.callCount + right.callCount,
        splitCount: left.splitCount + right.splitCount + 1
      };
    }
    throw err;
  }
}

async function processFastAnalysisTopics(options = {}, settingsOverride = null, totalStartedAtOverride = null) {
  const totalStartedAt = totalStartedAtOverride || options.totalStartedAt || performance.now();
  const phaseStartedAt = performance.now();
  const settings = settingsOverride || currentAnalysisSettings();
  let state = await refreshAnalysisRunProgress();
  if (!state) return;
  const done = new Set(state.done_chunk_ids || []);
  const chunks = options.chunks || state.chunks || [];
  const pendingChunks = chunks.filter(chunk => !done.has(chunk.chunk_id));
  const coverage = options.coverage || analysisCoverage(chunks, state.chunks || chunks);
  const selectedChars = totalChunkChars(chunks);
  const { workChunks, aggregates } = prepareFastWorkChunks(pendingChunks, settings);
  const oversizedCount = [...aggregates.values()].filter(item => item.expected > 1).length;
  const batches = splitChunksForFastPrompts(workChunks, settings);
  analysisLogLine(`Starting ${settings.analysisProfile} topic pass with ${pendingChunks.length} remaining chunks (${workChunks.length} LLM work units) in ${batches.length} model calls${options.label ? ` (${options.label})` : ''}. Selected ${chunks.length}/${state.chunk_count || chunks.length} chunks, ${compactNumber(selectedChars)} chars, max ${settings.maxTopicsPerChunk} topics/chunk, LLM call limit ${compactNumber(settings.llmCallCharLimit)}, ${oversizedCount} oversized chunks split, JSON mode off, model ${currentModel || 'none'}.`);
  const liveMetrics = { coverage };
  updateAnalysisMetrics({
    ...liveMetrics,
    phaseElapsedMs: 0,
    totalElapsedMs: performance.now() - totalStartedAt
  });
  const stopMetricsTicker = startAnalysisMetricsTicker(() => ({
    ...liveMetrics,
    phaseElapsedMs: performance.now() - phaseStartedAt,
    totalElapsedMs: performance.now() - totalStartedAt,
    elapsedMs: performance.now() - phaseStartedAt
  }));

  try {
    for (let i = 0; i < batches.length; i++) {
      if (analysisStopRequested) {
        analysisLogLine('Stopped by user.', 'warn');
        break;
      }
      const batch = batches[i];
      const batchId = `fast_topics_${String(i + 1).padStart(4, '0')}`;
      const doneInSelection = chunks.filter(c => done.has(c.chunk_id)).length;
      setAnalysisStatus('Fast processing', chunks.length ? (doneInSelection / chunks.length) * 100 : 0);
      if (analysisProgressText) analysisProgressText.textContent = `Processing ${batchId} (${batch.length} chunks, ${i + 1}/${batches.length} calls)`;
      const promptCharCount = fastTopicExtractionPrompt(batch, settings).length + 120;
      Object.assign(liveMetrics, {
        item: batchId,
        sourceCharCount: totalChunkChars(batch),
        promptCharCount,
        estimatedPromptTokens: estimatedTokenCount(promptCharCount)
      });
      updateAnalysisMetrics({
        ...liveMetrics,
        coverage,
        elapsedMs: performance.now() - phaseStartedAt,
        phaseElapsedMs: performance.now() - phaseStartedAt,
        totalElapsedMs: performance.now() - totalStartedAt
      });
      const batchResult = await runFastTopicBatchAdaptive(batch, settings, batchId);
      if (batchResult.errors.length) {
        await window.api.analysisSaveError(activeAnalysisDatasetId, activeAnalysisRunId, {
          created_at: new Date().toISOString(),
          stage: 'fast_topic_extraction_parse',
          batch_id: batchId,
          error_count: batchResult.errors.length,
          errors: batchResult.errors.slice(0, 25)
        }).catch(() => {});
        analysisLogLine(`${batchId}: skipped ${batchResult.errors.length} malformed or unmatched lines.`, 'warn');
      }
      for (const result of batchResult.results) {
        const chunk = batch.find(c => c.chunk_id === result.chunk_id) || {};
        const originalChunkId = chunk.original_chunk_id || result.chunk_id;
        const aggregate = aggregates.get(originalChunkId);
        if (!aggregate) continue;
        aggregate.received += 1;
        aggregate.topics.push(...((result.topics || []).map(topic => ({ ...topic }))));
        aggregate.events.push(...((result.events || []).map(event => ({ ...event }))));
        aggregate.promptCharCount += Number(batchResult.metrics.prompt_char_count) || 0;
        aggregate.responseCharCount += Number(batchResult.metrics.response_char_count) || 0;
        aggregate.estimatedPromptTokens += Number(batchResult.metrics.estimated_prompt_tokens) || 0;
        aggregate.estimatedResponseTokens += Number(batchResult.metrics.estimated_response_tokens) || 0;
        aggregate.durationMs += Number(batchResult.metrics.duration_ms) || 0;
        aggregate.callCount += Number(batchResult.callCount) || 0;
        aggregate.splitCount += Number(batchResult.splitCount) || 0;
        if (aggregate.received < aggregate.expected) continue;
        const original = aggregate.original;
        const savedResult = {
          chunk_id: original.chunk_id,
          time_start: original.time_start,
          time_end: original.time_end,
          topics: aggregate.topics,
          events: aggregate.events,
          input_hash: original.input_hash,
          processed_at: new Date().toISOString(),
          analysis_profile: settings.analysisProfile,
          llm_work_unit_count: aggregate.expected
        };
        result.input_hash = chunk.input_hash;
        savedResult.metrics = {
          stage: 'fast_topic_extraction',
          batch_id: batchId,
          chunk_id: original.chunk_id,
          source_char_count: chunkCharCount(original),
          prompt_char_count: aggregate.promptCharCount,
          response_char_count: aggregate.responseCharCount,
          estimated_prompt_tokens: aggregate.estimatedPromptTokens,
          estimated_response_tokens: aggregate.estimatedResponseTokens,
          duration_ms: aggregate.durationMs,
          model: batchResult.metrics.model || currentModel || '',
          max_tokens: batchResult.metrics.max_tokens,
          llm_call_char_limit: settings.llmCallCharLimit,
          work_unit_count: aggregate.expected,
          response_format_json_requested: false,
          response_format_json_used: false,
          adaptive_call_count: aggregate.callCount,
          adaptive_split_count: aggregate.splitCount,
          created_at: batchResult.metrics.created_at
        };
        await window.api.analysisSaveTopicResult(activeAnalysisDatasetId, activeAnalysisRunId, savedResult);
        done.add(original.chunk_id);
      }
      Object.assign(liveMetrics, {
        item: batchId,
        sourceCharCount: totalChunkChars(batch),
        promptCharCount: batchResult.metrics.prompt_char_count,
        responseCharCount: batchResult.metrics.response_char_count,
        estimatedPromptTokens: batchResult.metrics.estimated_prompt_tokens,
        estimatedResponseTokens: batchResult.metrics.estimated_response_tokens,
        durationMs: batchResult.metrics.duration_ms
      });
      updateAnalysisMetrics({
        ...liveMetrics,
        coverage,
        elapsedMs: performance.now() - phaseStartedAt,
        phaseElapsedMs: performance.now() - phaseStartedAt,
        totalElapsedMs: performance.now() - totalStartedAt
      });
      const savedTopicCount = batchResult.results.reduce((sum, r) => sum + (r.topics || []).length, 0);
      analysisLogLine(`Saved ${batchId}: ${batch.length} chunks, ${savedTopicCount} topics | ${batchResult.callCount} model call${batchResult.callCount === 1 ? '' : 's'}${batchResult.splitCount ? `, ${batchResult.splitCount} split retry` : ''} | source ${compactNumber(totalChunkChars(batch))} chars | prompt ${compactNumber(batchResult.metrics.prompt_char_count)} | response ${compactNumber(batchResult.metrics.response_char_count)} | ${formatDuration(batchResult.metrics.duration_ms)}`);
    }
  } catch (err) {
    stopMetricsTicker();
    analysisLogLine(`Fast topic pass failed: ${err?.message || err}`, 'error');
    setAnalysisStatus('Fast processing failed', 100);
    return;
  }

  stopMetricsTicker();
  if (analysisStopRequested) {
    markAnalysisStopped('Stopped during fast topic processing.');
    await loadAnalysisRuns();
    return;
  }
  const phaseDurationMs = performance.now() - phaseStartedAt;
  analysisLogLine(`Fast topic phase finished in ${formatDuration(phaseDurationMs)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
  analysisResultLine('Fast topic phase complete', [
    `duration ${formatDuration(phaseDurationMs)}`,
    `total ${formatDuration(performance.now() - totalStartedAt)}`,
    `${chunks.filter(c => done.has(c.chunk_id)).length}/${chunks.length} selected chunks done`,
    `${batches.length} model calls`
  ]);
  updateAnalysisMetrics({
    coverage,
    phaseElapsedMs: phaseDurationMs,
    totalElapsedMs: performance.now() - totalStartedAt,
    lastPhaseName: 'Fast topic phase',
    lastPhaseDurationMs: phaseDurationMs
  });
  await loadAnalysisRuns();
}

async function processAnalysisTopics(options = {}) {
  if (options instanceof Event) options = {};
  if (options.logKind) activeAnalysisLogKind = options.logKind;
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    analysisLogLine('Select a dataset and run first.', 'error');
    return;
  }
  if (!currentModel) {
    analysisLogLine('Select a model before processing.', 'error');
    return;
  }
  analysisStopRequested = false;
  const totalStartedAt = options.totalStartedAt || performance.now();
  const phaseStartedAt = performance.now();
  const settings = currentAnalysisSettings();
  if (settings.deterministicCanonization) {
    return processFastAnalysisTopics(options, settings, totalStartedAt);
  }
  let state = await refreshAnalysisRunProgress();
  if (!state) return;
  const done = new Set(state.done_chunk_ids || []);
  const chunks = options.chunks || state.chunks || [];
  const coverage = options.coverage || analysisCoverage(chunks, state.chunks || chunks);
  const remaining = chunks.filter(chunk => !done.has(chunk.chunk_id)).length;
  const selectedChars = totalChunkChars(chunks);
  const alreadyDone = chunks.length - remaining;
  analysisLogLine(`Starting topic pass with ${remaining} remaining chunks${options.label ? ` (${options.label})` : ''}. Selected ${chunks.length}/${state.chunk_count || chunks.length} chunks, ${compactNumber(selectedChars)} chars, ${alreadyDone} already done. Density ${settings.topicDensity}, max ${settings.maxTopicsPerChunk} topics/chunk, model ${currentModel || 'none'}.`);
  const liveMetrics = { coverage };
  Object.assign(liveMetrics, {
    phaseElapsedMs: 0,
    totalElapsedMs: performance.now() - totalStartedAt
  });
  updateAnalysisMetrics(liveMetrics);
  const stopMetricsTicker = startAnalysisMetricsTicker(() => ({
    ...liveMetrics,
    phaseElapsedMs: performance.now() - phaseStartedAt,
    totalElapsedMs: performance.now() - totalStartedAt,
    elapsedMs: performance.now() - phaseStartedAt
  }));

  for (let i = 0; i < chunks.length; i++) {
    if (analysisStopRequested) {
      analysisLogLine('Stopped by user.', 'warn');
      break;
    }
    const chunk = chunks[i];
    if (done.has(chunk.chunk_id)) continue;
    const subsetDone = chunks.filter(c => done.has(c.chunk_id)).length;
    setAnalysisStatus('Processing', chunks.length ? (subsetDone / chunks.length) * 100 : 0);
    if (analysisProgressText) analysisProgressText.textContent = `Processing ${chunk.chunk_id} (${subsetDone}/${chunks.length} selected chunks done)`;
    try {
      const prompt = topicExtractionPrompt(chunk, settings);
      const promptCharCount = messageCharCount([
        { role: 'system', content: 'You extract structured conceptual analysis from exported chat data. You return valid JSON only.' },
        { role: 'user', content: prompt }
      ]);
      Object.assign(liveMetrics, {
        item: chunk.chunk_id,
        sourceCharCount: chunkCharCount(chunk),
        promptCharCount,
        estimatedPromptTokens: estimatedTokenCount(promptCharCount)
      });
      updateAnalysisMetrics({
        ...liveMetrics,
        item: chunk.chunk_id,
        sourceCharCount: chunkCharCount(chunk),
        promptCharCount,
        estimatedPromptTokens: estimatedTokenCount(promptCharCount),
        coverage,
        elapsedMs: performance.now() - phaseStartedAt,
        phaseElapsedMs: performance.now() - phaseStartedAt,
        totalElapsedMs: performance.now() - totalStartedAt
      });
      const modelResult = await runAnalysisModelDetailed([
        { role: 'system', content: 'You extract structured conceptual analysis from exported chat data. You return valid JSON only.' },
        { role: 'user', content: prompt }
      ], settings.temperature, { maxTokens: 6144, responseFormatJson: true });
      const raw = modelResult.text;
      let parsed;
      try {
        parsed = extractJsonObject(raw);
      } catch (parseErr) {
        parsed = {
          chunk_id: chunk.chunk_id,
          time_start: chunk.time_start,
          time_end: chunk.time_end,
          topics: [],
          events: [],
          parse_error: parseErr.message,
          raw_response: raw
        };
        await window.api.analysisSaveError(activeAnalysisDatasetId, activeAnalysisRunId, {
          created_at: new Date().toISOString(),
          chunk_id: chunk.chunk_id,
          error: parseErr.message,
          raw_response: raw
        });
      }
      parsed.chunk_id = parsed.chunk_id || chunk.chunk_id;
      parsed.time_start = parsed.time_start || chunk.time_start;
      parsed.time_end = parsed.time_end || chunk.time_end;
      parsed.input_hash = chunk.input_hash;
      parsed.processed_at = new Date().toISOString();
      parsed.metrics = {
        stage: 'topic_extraction',
        chunk_id: chunk.chunk_id,
        source_char_count: chunkCharCount(chunk),
        prompt_char_count: modelResult.metrics.prompt_char_count,
        response_char_count: modelResult.metrics.response_char_count,
        estimated_prompt_tokens: modelResult.metrics.estimated_prompt_tokens,
        estimated_response_tokens: modelResult.metrics.estimated_response_tokens,
        duration_ms: modelResult.metrics.duration_ms,
        model: modelResult.metrics.model,
        max_tokens: modelResult.metrics.max_tokens,
        response_format_json_requested: modelResult.metrics.response_format_json_requested,
        response_format_json_used: modelResult.metrics.response_format_json_used,
        created_at: modelResult.metrics.created_at
      };
      await window.api.analysisSaveTopicResult(activeAnalysisDatasetId, activeAnalysisRunId, parsed);
      done.add(chunk.chunk_id);
      Object.assign(liveMetrics, {
        item: chunk.chunk_id,
        sourceCharCount: parsed.metrics.source_char_count,
        promptCharCount: parsed.metrics.prompt_char_count,
        responseCharCount: parsed.metrics.response_char_count,
        estimatedPromptTokens: parsed.metrics.estimated_prompt_tokens,
        estimatedResponseTokens: parsed.metrics.estimated_response_tokens,
        durationMs: parsed.metrics.duration_ms
      });
      updateAnalysisMetrics({
        ...liveMetrics,
        item: chunk.chunk_id,
        sourceCharCount: parsed.metrics.source_char_count,
        promptCharCount: parsed.metrics.prompt_char_count,
        responseCharCount: parsed.metrics.response_char_count,
        estimatedPromptTokens: parsed.metrics.estimated_prompt_tokens,
        estimatedResponseTokens: parsed.metrics.estimated_response_tokens,
        durationMs: parsed.metrics.duration_ms,
        coverage,
        elapsedMs: performance.now() - phaseStartedAt,
        phaseElapsedMs: performance.now() - phaseStartedAt,
        totalElapsedMs: performance.now() - totalStartedAt
      });
      analysisLogLine(`Saved ${chunk.chunk_id}: ${(parsed.topics || []).length} topics | source ${compactNumber(parsed.metrics.source_char_count)} chars | prompt ${compactNumber(parsed.metrics.prompt_char_count)} | response ${compactNumber(parsed.metrics.response_char_count)} | ${formatDuration(parsed.metrics.duration_ms)}`);
      const updatedSubsetDone = chunks.filter(c => done.has(c.chunk_id)).length;
      setAnalysisStatus('Processing', chunks.length ? (updatedSubsetDone / chunks.length) * 100 : 0);
    } catch (err) {
      analysisLogLine(`Failed ${chunk.chunk_id}: ${err?.message || err}`, 'error');
      await window.api.analysisSaveError(activeAnalysisDatasetId, activeAnalysisRunId, {
        created_at: new Date().toISOString(),
        chunk_id: chunk.chunk_id,
        error: err?.message || String(err)
      }).catch(() => {});
      break;
    }
  }
  stopMetricsTicker();
  if (analysisStopRequested) {
    markAnalysisStopped('Stopped during topic processing.');
    await loadAnalysisRuns();
    return;
  }
  const phaseDurationMs = performance.now() - phaseStartedAt;
  analysisLogLine(`Topic phase finished in ${formatDuration(phaseDurationMs)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
  analysisResultLine('Topic phase complete', [
    `duration ${formatDuration(phaseDurationMs)}`,
    `total ${formatDuration(performance.now() - totalStartedAt)}`,
    `${chunks.filter(c => done.has(c.chunk_id)).length}/${chunks.length} selected chunks done`,
    `${compactNumber(totalChunkChars(chunks))} selected chars`
  ]);
  updateAnalysisMetrics({
    coverage,
    phaseElapsedMs: phaseDurationMs,
    totalElapsedMs: performance.now() - totalStartedAt,
    lastPhaseName: 'Topic phase',
    lastPhaseDurationMs: phaseDurationMs
  });
  await loadAnalysisRuns();
}

const CONCEPT_KEY_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with',
  'app', 'apps', 'project', 'system', 'tool', 'feature', 'idea', 'discussion', 'analysis'
]);

function conceptMergeKey(value) {
  const words = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(word => word && !CONCEPT_KEY_STOPWORDS.has(word));
  return (words.length ? words : String(value || '').toLowerCase().split(/\s+/).filter(Boolean))
    .slice(0, 7)
    .join('_') || normalizeConceptId(value);
}

function chooseCanonicalLabel(existingLabel, nextLabel) {
  const current = String(existingLabel || '').trim();
  const next = String(nextLabel || '').trim();
  if (!current) return next;
  if (!next) return current;
  if (next.length < current.length && next.length >= 4) return next;
  return current;
}

function addUniqueLimited(values, additions, limit) {
  const out = [...(values || [])];
  for (const value of additions || []) {
    const clean = sanitizeFastField(value, 160);
    if (clean && !out.some(v => v.toLowerCase() === clean.toLowerCase())) out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function deterministicGraphFromTopicResults(datasetId, runId, results, profile) {
  const concepts = new Map();
  const parentEdges = new Map();
  const events = [];
  const chunkConceptIds = new Map();

  for (const result of results || []) {
    const chunkIdsForEvent = [];
    for (const topic of result.topics || []) {
      const label = sanitizeFastField(topic.label || topic.canonical_label, 120);
      if (!label) continue;
      const key = conceptMergeKey(label);
      const conceptId = normalizeConceptId(key);
      const existing = concepts.get(conceptId) || {
        concept_id: conceptId,
        canonical_label: label,
        level: sanitizeFastField(topic.level || 'topic', 24) || 'topic',
        parent_id: '',
        aliases: [],
        summary: '',
        subtopics: [],
        evidence: [],
        _count: 0,
        _summary_chars: 0
      };
      existing._count += 1;
      existing.canonical_label = chooseCanonicalLabel(existing.canonical_label, label);
      existing.aliases = addUniqueLimited(existing.aliases, [label, ...(topic.aliases || [])], 8);
      const summary = sanitizeFastField(topic.summary || label, 260);
      if (summary && (!existing.summary || summary.length > existing._summary_chars)) {
        existing.summary = summary;
        existing._summary_chars = summary.length;
      }
      existing.subtopics = addUniqueLimited(existing.subtopics, topic.subtopics || [], 12);
      if (topic.parent_label) {
        const parentId = normalizeConceptId(conceptMergeKey(topic.parent_label));
        existing.parent_id = existing.parent_id || parentId;
        parentEdges.set(`${parentId}->${conceptId}`, {
          source: parentId,
          target: conceptId,
          relationship: 'develops',
          weight: 0.55
        });
        if (!concepts.has(parentId)) {
          concepts.set(parentId, {
            concept_id: parentId,
            canonical_label: sanitizeFastField(topic.parent_label, 120),
            level: 'macro',
            parent_id: '',
            aliases: [sanitizeFastField(topic.parent_label, 120)],
            summary: sanitizeFastField(topic.parent_label, 180),
            subtopics: [label],
            evidence: [],
            _count: 0,
            _summary_chars: 0
          });
        } else {
          const parent = concepts.get(parentId);
          parent.subtopics = addUniqueLimited(parent.subtopics, [label], 12);
        }
      }
      if (topic.evidence_record_ids?.length) {
        existing.evidence.push({
          chunk_id: result.chunk_id,
          record_ids: topic.evidence_record_ids.slice(0, 4)
        });
        existing.evidence = existing.evidence.slice(0, 8);
      }
      concepts.set(conceptId, existing);
      chunkIdsForEvent.push(conceptId);
    }
    chunkConceptIds.set(result.chunk_id, chunkIdsForEvent.slice(0, 8));

    for (const event of result.events || []) {
      const summary = sanitizeFastField(event.summary, 260);
      if (!summary) continue;
      events.push({
        event_id: normalizeConceptId(`${result.chunk_id}_${event.timestamp || events.length}_${summary}`),
        timestamp: sanitizeFastField(event.timestamp || result.time_start, 60),
        concept_ids: chunkConceptIds.get(result.chunk_id) || [],
        summary
      });
      if (events.length >= 500) break;
    }
  }

  const conceptList = [...concepts.values()]
    .map(concept => {
      const clean = { ...concept };
      clean.aliases = (clean.aliases || []).filter(alias => alias && alias !== clean.canonical_label).slice(0, 8);
      clean.summary = clean.summary || clean.canonical_label;
      delete clean._count;
      delete clean._summary_chars;
      return clean;
    })
    .sort((a, b) => {
      const ac = (a.evidence || []).length + (a.aliases || []).length;
      const bc = (b.evidence || []).length + (b.aliases || []).length;
      return bc - ac || a.canonical_label.localeCompare(b.canonical_label);
    })
    .slice(0, 900);

  const conceptIds = new Set(conceptList.map(c => c.concept_id));
  const edges = [...parentEdges.values()]
    .filter(edge => conceptIds.has(edge.source) && conceptIds.has(edge.target))
    .slice(0, 1000);

  return {
    schema_version: '0.1.0',
    dataset: { id: datasetId, run_id: runId },
    graph_id: `deterministic_${profile}_${hashString(`${datasetId}:${runId}:${results.length}`).slice(0, 8)}`,
    concepts: conceptList,
    events: events.slice(0, 500),
    edges,
    generated_at: new Date().toISOString(),
    source_result_count: results.length,
    canonization_mode: `deterministic_${profile}`,
    metrics: {
      stage: 'final_graph',
      source_result_count: results.length,
      concept_count: conceptList.length,
      event_count: Math.min(events.length, 500),
      edge_count: edges.length,
      model: currentModel || '',
      response_format_json_used: false,
      generated_at: new Date().toISOString()
    }
  };
}

async function canonizeAnalysisRunFast(options = {}) {
  const totalStartedAt = options.totalStartedAt || performance.now();
  const canonStartedAt = performance.now();
  const settings = currentAnalysisSettings();
  const allResults = await window.api.analysisLoadTopicResults(activeAnalysisDatasetId, activeAnalysisRunId);
  const results = uniqueTopicResults(allResults);
  if (!results.length) {
    analysisLogLine('No topic results to canonize yet.', 'error');
    return;
  }
  setAnalysisStatus('Fast exporting', 90);
  if (analysisProgressText) analysisProgressText.textContent = `Canonizing ${results.length} topic results locally`;
  analysisLogLine(`Starting deterministic ${settings.analysisProfile} canonization/export for ${results.length} unique chunk results. No JSON mode, no canonization model calls.`);
  const graph = deterministicGraphFromTopicResults(activeAnalysisDatasetId, activeAnalysisRunId, results, settings.analysisProfile);
  graph.ignored_duplicate_result_lines = Math.max(0, allResults.length - results.length);
  graph.metrics = {
    ...(graph.metrics || {}),
    duplicate_result_lines: graph.ignored_duplicate_result_lines,
    canonization_duration_ms: performance.now() - canonStartedAt,
    total_elapsed_ms: performance.now() - totalStartedAt
  };
  const saved = await window.api.analysisSaveGraph(activeAnalysisDatasetId, activeAnalysisRunId, graph);
  if (analysisOutputPath) analysisOutputPath.textContent = `Output: ${saved.path}`;
  const durationMs = performance.now() - canonStartedAt;
  analysisLogLine(`Saved graph: ${saved.path}`);
  analysisLogLine(`Deterministic canonization finished in ${formatDuration(durationMs)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
  analysisResultLine('Fast canonization complete', [
    `duration ${formatDuration(durationMs)}`,
    `total ${formatDuration(performance.now() - totalStartedAt)}`,
    `${(graph.concepts || []).length} concepts`,
    `${(graph.events || []).length} events`,
    `${(graph.edges || []).length} edges`
  ]);
  updateAnalysisMetrics({
    totalElapsedMs: performance.now() - totalStartedAt,
    lastPhaseName: 'Fast canonization',
    lastPhaseDurationMs: durationMs
  });
  setAnalysisStatus('Exported', 100);
}

async function canonizeAnalysisRun(options = {}) {
  if (options instanceof Event) options = {};
  if (options.logKind) activeAnalysisLogKind = options.logKind;
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    analysisLogLine('Select a dataset and run first.', 'error');
    return;
  }
  const settings = currentAnalysisSettings();
  if (settings.deterministicCanonization) {
    return canonizeAnalysisRunFast(options);
  }
  if (!currentModel) {
    analysisLogLine('Select a model before canonization.', 'error');
    return;
  }
  analysisStopRequested = false;
  const totalStartedAt = options.totalStartedAt || performance.now();
  const canonStartedAt = performance.now();
  const allResults = await window.api.analysisLoadTopicResults(activeAnalysisDatasetId, activeAnalysisRunId);
  const results = uniqueTopicResults(allResults);
  if (!results.length) {
    analysisLogLine('No topic results to canonize yet.', 'error');
    return;
  }
  const duplicateCount = Math.max(0, allResults.length - results.length);
  const batchCharBudget = 22_000;
  const mergeCharBudget = 24_000;
  const batches = splitByPromptBudget(
    results,
    batchCharBudget,
    (item) => JSON.stringify(compactTopicResult(item))
  );
  setAnalysisStatus('Canonizing', 0);
  analysisLogLine(`Starting batched canonization: ${results.length} unique chunk results, ${batches.length} batches${duplicateCount ? `, ${duplicateCount} duplicate result lines ignored` : ''}. Batch budget ${compactNumber(batchCharBudget)} chars, merge budget ${compactNumber(mergeCharBudget)} chars, model ${currentModel || 'none'}.`);
  const liveCanonMetrics = {};
  let currentCanonPhaseStartedAt = canonStartedAt;
  Object.assign(liveCanonMetrics, {
    phaseElapsedMs: 0,
    totalElapsedMs: performance.now() - totalStartedAt
  });
  updateAnalysisMetrics(liveCanonMetrics);
  const stopCanonTicker = startAnalysisMetricsTicker(() => ({
    ...liveCanonMetrics,
    phaseElapsedMs: performance.now() - currentCanonPhaseStartedAt,
    totalElapsedMs: performance.now() - totalStartedAt
  }));

  try {
    const existing = await window.api.analysisListCanonBatches(activeAnalysisDatasetId, activeAnalysisRunId).catch(() => []);
    const existingById = new Map(existing.map(g => [g._batch_id, g]));
    const graphs = [];
    const batchPhaseStartedAt = performance.now();
    currentCanonPhaseStartedAt = batchPhaseStartedAt;
    for (let i = 0; i < batches.length; i++) {
      if (analysisStopRequested) {
        analysisLogLine('Canonization stopped by user.', 'warn');
        stopCanonTicker();
        markAnalysisStopped('Stopped during canonization.');
        return;
      }
      const batchId = canonBatchId('batch', i, batches[i], (item) => JSON.stringify(compactTopicResult(item)));
      const existingGraph = existingById.get(batchId);
      if (existingGraph) {
        graphs.push(existingGraph);
        analysisLogLine(`Using saved ${batchId}`);
      } else {
        const pct = batches.length ? (i / batches.length) * 60 : 0;
        setAnalysisStatus('Canonizing batches', pct);
        if (analysisProgressText) analysisProgressText.textContent = `Canonizing ${batchId} (${i + 1}/${batches.length})`;
        const prompt = canonizationBatchPrompt(activeAnalysisDatasetId, activeAnalysisRunId, batchId, batches[i]);
        const promptCharCount = messageCharCount([
          { role: 'system', content: 'You merge topic candidates into a canonical concept graph. You return valid JSON only.' },
          { role: 'user', content: prompt }
        ]);
        Object.assign(liveCanonMetrics, {
          item: batchId,
          promptCharCount,
          estimatedPromptTokens: estimatedTokenCount(promptCharCount)
        });
        updateAnalysisMetrics({
          ...liveCanonMetrics,
          item: batchId,
          promptCharCount,
          estimatedPromptTokens: estimatedTokenCount(promptCharCount),
          phaseElapsedMs: performance.now() - batchPhaseStartedAt,
          totalElapsedMs: performance.now() - totalStartedAt
        });
        const modelResult = await runAnalysisModelDetailed([
          { role: 'system', content: 'You merge topic candidates into a canonical concept graph. You return valid JSON only.' },
          { role: 'user', content: prompt }
        ], Math.min(0.1, currentAnalysisSettings().temperature), { maxTokens: 8192, responseFormatJson: true });
        const raw = modelResult.text;
        let graph;
        try {
          graph = await parseAnalysisJsonWithRepair(raw, batchId, graphSchemaInstruction(activeAnalysisDatasetId, activeAnalysisRunId));
        } catch (err) {
          await window.api.analysisSaveError(activeAnalysisDatasetId, activeAnalysisRunId, {
            created_at: new Date().toISOString(),
            stage: 'canonization_batch',
            batch_id: batchId,
            error: err?.message || String(err),
            raw_response: err?.rawResponse || raw,
            repair_response: err?.repairResponse || ''
          }).catch(() => {});
          if (err?.message === 'cancelled') throw err;
          analysisLogLine(`${batchId} could not be repaired; saving deterministic fallback graph.`, 'warn');
          graph = fallbackGraphFromTopicBatch(activeAnalysisDatasetId, activeAnalysisRunId, batchId, batches[i]);
        }
        graph = normalizeGraph(graph, batchId);
        graph.dataset = graph.dataset || { id: activeAnalysisDatasetId, run_id: activeAnalysisRunId };
        graph.graph_id = graph.graph_id || batchId;
        graph.batch_id = batchId;
        graph.source_result_count = batches[i].length;
        graph.generated_at = new Date().toISOString();
        graph.metrics = {
          stage: 'canonization_batch',
          batch_id: batchId,
          input_item_count: batches[i].length,
          input_char_count: JSON.stringify(batches[i].map(compactTopicResult)).length,
          prompt_char_count: modelResult.metrics.prompt_char_count,
          response_char_count: modelResult.metrics.response_char_count,
          estimated_prompt_tokens: modelResult.metrics.estimated_prompt_tokens,
          estimated_response_tokens: modelResult.metrics.estimated_response_tokens,
          duration_ms: modelResult.metrics.duration_ms,
          model: modelResult.metrics.model,
          max_tokens: modelResult.metrics.max_tokens,
          response_format_json_requested: modelResult.metrics.response_format_json_requested,
          response_format_json_used: modelResult.metrics.response_format_json_used,
          concept_count: (graph.concepts || []).length,
          event_count: (graph.events || []).length,
          edge_count: (graph.edges || []).length,
          fallback: graph.fallback === true,
          created_at: modelResult.metrics.created_at
        };
        await window.api.analysisSaveCanonBatch(activeAnalysisDatasetId, activeAnalysisRunId, batchId, graph);
        graphs.push(graph);
        Object.assign(liveCanonMetrics, {
          item: batchId,
          promptCharCount: graph.metrics.prompt_char_count,
          responseCharCount: graph.metrics.response_char_count,
          estimatedPromptTokens: graph.metrics.estimated_prompt_tokens,
          estimatedResponseTokens: graph.metrics.estimated_response_tokens,
          durationMs: graph.metrics.duration_ms
        });
        updateAnalysisMetrics({
          ...liveCanonMetrics,
          item: batchId,
          promptCharCount: graph.metrics.prompt_char_count,
          responseCharCount: graph.metrics.response_char_count,
          estimatedPromptTokens: graph.metrics.estimated_prompt_tokens,
          estimatedResponseTokens: graph.metrics.estimated_response_tokens,
          durationMs: graph.metrics.duration_ms,
          phaseElapsedMs: performance.now() - batchPhaseStartedAt,
          totalElapsedMs: performance.now() - totalStartedAt
        });
        analysisLogLine(`Saved ${batchId}: ${(graph.concepts || []).length} concepts | prompt ${compactNumber(graph.metrics.prompt_char_count)} | response ${compactNumber(graph.metrics.response_char_count)} | ${formatDuration(graph.metrics.duration_ms)}`);
      }
    }
    const batchPhaseDurationMs = performance.now() - batchPhaseStartedAt;
    analysisLogLine(`Canonization batch phase finished in ${formatDuration(batchPhaseDurationMs)} for ${graphs.length} graph fragments. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
    analysisResultLine('Canonization batch phase complete', [
      `duration ${formatDuration(batchPhaseDurationMs)}`,
      `${graphs.length} fragments`,
      `total ${formatDuration(performance.now() - totalStartedAt)}`
    ]);
    updateAnalysisMetrics({
      phaseElapsedMs: batchPhaseDurationMs,
      totalElapsedMs: performance.now() - totalStartedAt,
      lastPhaseName: 'Batch phase',
      lastPhaseDurationMs: batchPhaseDurationMs
    });

    let round = 1;
    let fragments = graphs;
    while (fragments.length > 1) {
      if (analysisStopRequested) {
        analysisLogLine('Canonization stopped by user.', 'warn');
        stopCanonTicker();
        markAnalysisStopped('Stopped during merge.');
        return;
      }
      const mergeBatches = splitByPromptBudget(
        fragments,
        mergeCharBudget,
        (item) => JSON.stringify(compactGraphFragment(item))
      );
      analysisLogLine(`Merge round ${round}: ${fragments.length} fragments -> ${mergeBatches.length} batches`);
      const roundStartedAt = performance.now();
      currentCanonPhaseStartedAt = roundStartedAt;
      const next = [];
      const savedRound = await window.api.analysisListCanonBatches(activeAnalysisDatasetId, activeAnalysisRunId).catch(() => []);
      const savedById = new Map(savedRound.map(g => [g._batch_id, g]));
      for (let i = 0; i < mergeBatches.length; i++) {
        if (analysisStopRequested) {
          analysisLogLine('Canonization stopped by user.', 'warn');
          stopCanonTicker();
          markAnalysisStopped('Stopped during merge.');
          return;
        }
        const mergeId = canonBatchId(`round_${String(round).padStart(2, '0')}`, i, mergeBatches[i], (item) => JSON.stringify(compactGraphFragment(item)));
        const existingGraph = savedById.get(mergeId);
        if (existingGraph) {
          next.push(existingGraph);
          analysisLogLine(`Using saved ${mergeId}`);
          continue;
        }
        const pct = 60 + Math.min(35, ((round - 1) * 10) + (i / Math.max(1, mergeBatches.length)) * 10);
        setAnalysisStatus('Merging concepts', pct);
        if (analysisProgressText) analysisProgressText.textContent = `Merging ${mergeId} (${i + 1}/${mergeBatches.length})`;
        const prompt = canonizationMergePrompt(activeAnalysisDatasetId, activeAnalysisRunId, mergeId, mergeBatches[i]);
        const promptCharCount = messageCharCount([
          { role: 'system', content: 'You merge canonical concept graph fragments. You return valid JSON only.' },
          { role: 'user', content: prompt }
        ]);
        Object.assign(liveCanonMetrics, {
          item: mergeId,
          promptCharCount,
          estimatedPromptTokens: estimatedTokenCount(promptCharCount)
        });
        updateAnalysisMetrics({
          ...liveCanonMetrics,
          item: mergeId,
          promptCharCount,
          estimatedPromptTokens: estimatedTokenCount(promptCharCount),
          phaseElapsedMs: performance.now() - roundStartedAt,
          totalElapsedMs: performance.now() - totalStartedAt
        });
        const modelResult = await runAnalysisModelDetailed([
          { role: 'system', content: 'You merge canonical concept graph fragments. You return valid JSON only.' },
          { role: 'user', content: prompt }
        ], Math.min(0.1, currentAnalysisSettings().temperature), { maxTokens: 8192, responseFormatJson: true });
        const raw = modelResult.text;
        let merged;
        try {
          merged = await parseAnalysisJsonWithRepair(raw, mergeId, graphSchemaInstruction(activeAnalysisDatasetId, activeAnalysisRunId));
        } catch (err) {
          await window.api.analysisSaveError(activeAnalysisDatasetId, activeAnalysisRunId, {
            created_at: new Date().toISOString(),
            stage: 'canonization_merge',
            batch_id: mergeId,
            error: err?.message || String(err),
            raw_response: err?.rawResponse || raw,
            repair_response: err?.repairResponse || ''
          }).catch(() => {});
          if (err?.message === 'cancelled') throw err;
          analysisLogLine(`${mergeId} could not be repaired; saving deterministic fallback graph.`, 'warn');
          merged = fallbackGraphFromFragments(activeAnalysisDatasetId, activeAnalysisRunId, mergeId, mergeBatches[i]);
        }
        merged = normalizeGraph(merged, mergeId);
        merged.dataset = merged.dataset || { id: activeAnalysisDatasetId, run_id: activeAnalysisRunId };
        merged.graph_id = merged.graph_id || mergeId;
        merged.batch_id = mergeId;
        merged.generated_at = new Date().toISOString();
        merged.metrics = {
          stage: 'canonization_merge',
          batch_id: mergeId,
          input_item_count: mergeBatches[i].length,
          input_char_count: JSON.stringify(mergeBatches[i].map(compactGraphFragment)).length,
          prompt_char_count: modelResult.metrics.prompt_char_count,
          response_char_count: modelResult.metrics.response_char_count,
          estimated_prompt_tokens: modelResult.metrics.estimated_prompt_tokens,
          estimated_response_tokens: modelResult.metrics.estimated_response_tokens,
          duration_ms: modelResult.metrics.duration_ms,
          model: modelResult.metrics.model,
          max_tokens: modelResult.metrics.max_tokens,
          response_format_json_requested: modelResult.metrics.response_format_json_requested,
          response_format_json_used: modelResult.metrics.response_format_json_used,
          concept_count: (merged.concepts || []).length,
          event_count: (merged.events || []).length,
          edge_count: (merged.edges || []).length,
          fallback: merged.fallback === true,
          created_at: modelResult.metrics.created_at
        };
        await window.api.analysisSaveCanonBatch(activeAnalysisDatasetId, activeAnalysisRunId, mergeId, merged);
        next.push(merged);
        Object.assign(liveCanonMetrics, {
          item: mergeId,
          promptCharCount: merged.metrics.prompt_char_count,
          responseCharCount: merged.metrics.response_char_count,
          estimatedPromptTokens: merged.metrics.estimated_prompt_tokens,
          estimatedResponseTokens: merged.metrics.estimated_response_tokens,
          durationMs: merged.metrics.duration_ms
        });
        updateAnalysisMetrics({
          ...liveCanonMetrics,
          item: mergeId,
          promptCharCount: merged.metrics.prompt_char_count,
          responseCharCount: merged.metrics.response_char_count,
          estimatedPromptTokens: merged.metrics.estimated_prompt_tokens,
          estimatedResponseTokens: merged.metrics.estimated_response_tokens,
          durationMs: merged.metrics.duration_ms,
          phaseElapsedMs: performance.now() - roundStartedAt,
          totalElapsedMs: performance.now() - totalStartedAt
        });
        analysisLogLine(`Saved ${mergeId}: ${(merged.concepts || []).length} concepts | prompt ${compactNumber(merged.metrics.prompt_char_count)} | response ${compactNumber(merged.metrics.response_char_count)} | ${formatDuration(merged.metrics.duration_ms)}`);
      }
      const roundDurationMs = performance.now() - roundStartedAt;
      analysisLogLine(`Merge round ${round} finished in ${formatDuration(roundDurationMs)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
      analysisResultLine(`Merge round ${round} complete`, [
        `duration ${formatDuration(roundDurationMs)}`,
        `${next.length} fragments`,
        `total ${formatDuration(performance.now() - totalStartedAt)}`
      ]);
      updateAnalysisMetrics({
        phaseElapsedMs: roundDurationMs,
        totalElapsedMs: performance.now() - totalStartedAt,
        lastPhaseName: `Merge round ${round}`,
        lastPhaseDurationMs: roundDurationMs
      });
      fragments = next;
      round += 1;
    }

    const graph = fragments[0];
    graph.schema_version = graph.schema_version || '0.1.0';
    graph.dataset = graph.dataset || { id: activeAnalysisDatasetId, run_id: activeAnalysisRunId };
    graph.generated_at = new Date().toISOString();
    graph.source_result_count = results.length;
    graph.ignored_duplicate_result_lines = duplicateCount;
    graph.canonization_mode = 'batched';
    const canonDurationMs = performance.now() - canonStartedAt;
    graph.metrics = {
      ...(graph.metrics || {}),
      stage: 'final_graph',
      source_result_count: results.length,
      duplicate_result_lines: duplicateCount,
      concept_count: (graph.concepts || []).length,
      event_count: (graph.events || []).length,
      edge_count: (graph.edges || []).length,
      aggregate_canonization: aggregateGraphMetrics(graphs),
      canonization_duration_ms: canonDurationMs,
      total_elapsed_ms: performance.now() - totalStartedAt,
      generated_at: new Date().toISOString()
    };
    const saved = await window.api.analysisSaveGraph(activeAnalysisDatasetId, activeAnalysisRunId, graph);
    stopCanonTicker();
    if (analysisOutputPath) analysisOutputPath.textContent = `Output: ${saved.path}`;
    analysisLogLine(`Saved graph: ${saved.path}`);
    analysisLogLine(`Canonization finished in ${formatDuration(canonDurationMs)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`);
    analysisResultLine('Canonization complete', [
      `duration ${formatDuration(canonDurationMs)}`,
      `total ${formatDuration(performance.now() - totalStartedAt)}`,
      `${(graph.concepts || []).length} concepts`,
      `${(graph.events || []).length} events`,
      `${(graph.edges || []).length} edges`
    ]);
    updateAnalysisMetrics({
      totalElapsedMs: performance.now() - totalStartedAt,
      lastPhaseName: 'Canonization',
      lastPhaseDurationMs: canonDurationMs
    });
    setAnalysisStatus('Exported', 100);
  } catch (err) {
    stopCanonTicker();
    if ((err?.message || String(err)) === 'cancelled') {
      analysisLogLine(`Canonization stopped after ${formatDuration(performance.now() - canonStartedAt)}. Total elapsed ${formatDuration(performance.now() - totalStartedAt)}.`, 'warn');
      setAnalysisStatus('Stopped', 100);
      return;
    }
    analysisLogLine(`Canonization failed: ${err?.message || err}`, 'error');
    setAnalysisStatus('Canonize failed', 100);
  }
}

initAnalysisProfile();
initAnalysisSourceTabs();

for (const tab of appModeTabs) {
  tab.addEventListener('click', () => setAnalysisMode(tab.dataset.mode === 'analysis'));
}
analysisBackChat?.addEventListener('click', () => setAnalysisMode(false));
reasoningChatToggle?.addEventListener('click', () => {
  requestChatReasoning = !requestChatReasoning;
  localStorage.setItem('requestChatReasoning', requestChatReasoning ? '1' : '0');
  renderReasoningInfo();
  addMessage('system', `Chat reasoning ${requestChatReasoning ? 'will be requested' : 'is explicitly off'}. ${inferReasoningCapability(currentModel).detail}`);
});
reasoningAnalysisToggle?.addEventListener('click', () => {
  requestAnalysisReasoning = !requestAnalysisReasoning;
  localStorage.setItem('requestAnalysisReasoning', requestAnalysisReasoning ? '1' : '0');
  renderReasoningInfo();
  analysisLogLine(`Data analysis reasoning ${requestAnalysisReasoning ? 'will be requested' : 'is explicitly off'}. ${inferReasoningCapability(currentModel).detail}`);
});
reasoningInfoBtn?.addEventListener('click', () => {
  reasoningInfoOpen = !reasoningInfoOpen;
  renderReasoningInfo();
});
analysisRefreshBtn?.addEventListener('click', loadAnalysisDatasets);
analysisRunRefreshBtn?.addEventListener('click', loadAnalysisRuns);
for (const tab of analysisSourceTabs) {
  tab.addEventListener('click', async () => {
    const source = tab.dataset.source;
    if (!source || source === activeAnalysisSource) return;
    if (analysisBusy) {
      analysisLogLine('Finish or stop the current analysis before switching source tabs.', 'warn');
      return;
    }
    saveCurrentAnalysisSourceState();
    clearAnalysisView('');
    activeAnalysisPaths = null;
    restoreAnalysisSourceState(source);
    renderAnalysisSourceTabs();
    setAnalysisStatus('Loading', 0);
    setAnalysisLoading(true, `Loading ${analysisSourceLabel(source)} workspace...`);
    if (analysisProgressText) analysisProgressText.textContent = `Loading ${analysisSourceLabel(source)} data analysis workspace...`;
    await new Promise(resolve => requestAnimationFrame(resolve));
    await loadAnalysisDatasets();
  });
}
analysisSourcePath?.addEventListener('input', () => {
  localStorage.setItem(analysisStorageKey('analysisSourcePath'), analysisSourcePath.value || '');
});
analysisDatasetSelect?.addEventListener('change', async () => {
  activeAnalysisDatasetId = analysisDatasetSelect.value;
  localStorage.setItem(analysisStorageKey('activeAnalysisDatasetId'), activeAnalysisDatasetId);
  renderAnalysisDatasetSummary(analysisDatasets.find(d => d.dataset_id === activeAnalysisDatasetId));
  activeAnalysisRunId = '';
  await loadAnalysisRuns();
});
analysisRunSelect?.addEventListener('change', async () => {
  activeAnalysisRunId = analysisRunSelect.value;
  localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), activeAnalysisRunId);
  await refreshAnalysisPaths();
  await refreshAnalysisRunProgress();
});
analysisOpenOutputBtn?.addEventListener('click', async () => {
  const paths = activeAnalysisPaths || await refreshAnalysisPaths();
  const target = paths?.outputGraph || paths?.runDir;
  if (!target) return analysisLogLine('No run output path available.', 'error');
  window.api.analysisOpenPath(target).catch((err) => analysisLogLine(`Open output failed: ${err?.message || err}`, 'error'));
});
analysisOpenRunFolderBtn?.addEventListener('click', async () => {
  const paths = activeAnalysisPaths || await refreshAnalysisPaths();
  if (!paths?.runDir) return analysisLogLine('No run folder available.', 'error');
  window.api.analysisOpenPath(paths.runDir).catch((err) => analysisLogLine(`Open run folder failed: ${err?.message || err}`, 'error'));
});
analysisOpenLogBtn?.addEventListener('click', async () => {
  const paths = activeAnalysisPaths || await refreshAnalysisPaths();
  const target = activeAnalysisLogKind === 'test' ? paths?.testLog : paths?.analysisLog;
  if (!target) return analysisLogLine('No log path available.', 'error');
  window.api.analysisOpenPath(target).catch((err) => analysisLogLine(`Open log failed: ${err?.message || err}`, 'error'));
});
analysisImportBtn?.addEventListener('click', async () => {
  await withAnalysisBusy(async () => {
    const path = analysisSourcePath?.value?.trim();
    if (!path) return analysisLogLine(`Paste a ${analysisSourceLabel()} export path first.`, 'error');
    setAnalysisStatus('Importing', 0);
    try {
      const dataset = await window.api.analysisImport(path, activeAnalysisSource);
      activeAnalysisDatasetId = dataset.dataset_id;
      localStorage.setItem(analysisStorageKey('activeAnalysisDatasetId'), activeAnalysisDatasetId);
      analysisLogLine(`Imported ${dataset.dataset_id}: ${dataset.record_count} records from ${dataset.source_format || activeAnalysisSource}`);
      await loadAnalysisDatasets();
    } catch (err) {
      analysisLogLine(`Import failed: ${err?.message || err}`, 'error');
      setAnalysisStatus('Import failed', 0);
    }
  });
});
analysisChunkBtn?.addEventListener('click', async () => {
  await withAnalysisBusy(async () => {
    if (!activeAnalysisDatasetId) return analysisLogLine('Import or select a dataset first.', 'error');
    const target = currentAnalysisSettings().chunkTargetChars;
    setAnalysisStatus('Chunking', 0);
    try {
      const result = await window.api.analysisBuildChunks(activeAnalysisDatasetId, target);
      analysisLogLine(`Built ${result.chunk_count} chunks at target ${result.target_chars} chars`);
      await loadAnalysisDatasets();
      setAnalysisStatus('Chunks ready', 0);
    } catch (err) {
      analysisLogLine(`Chunking failed: ${err?.message || err}`, 'error');
      setAnalysisStatus('Chunking failed', 0);
    }
  });
});
analysisNewRunBtn?.addEventListener('click', async () => {
  await withAnalysisBusy(async () => {
    if (!activeAnalysisDatasetId) return analysisLogLine('Select a dataset first.', 'error');
    try {
      const run = await window.api.analysisCreateRun(activeAnalysisDatasetId, currentAnalysisSettings());
      activeAnalysisRunId = run.run_id;
      localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), activeAnalysisRunId);
      analysisLogLine(`Created ${run.run_id}`);
      await loadAnalysisRuns();
    } catch (err) {
      analysisLogLine(`Run creation failed: ${err?.message || err}`, 'error');
    }
  });
});
analysisProfile?.addEventListener('change', () => {
  localStorage.setItem('analysisProfile', analysisProfile.value || 'fast');
  applyAnalysisProfileDefaults(analysisProfile.value || 'fast', true);
  analysisLogLine(`Analysis profile set to ${analysisProfile.value || 'fast'}.`);
});
analysisDensity?.addEventListener('change', () => {
  const profile = analysisProfile?.value || 'fast';
  const defaults = profile === 'quality'
    ? { sparse: 10, normal: 18, rich: 30 }
    : { sparse: 25, normal: 40, rich: 50 };
  if (analysisMaxTopics && !densityChanged) {
    analysisMaxTopics.value = defaults[analysisDensity.value] || 24;
  }
});
analysisMaxTopics?.addEventListener('input', () => { densityChanged = true; });
analysisProcessBtn?.addEventListener('click', () => {
  withAnalysisBusy(async () => {
    clearAnalysisView('analysis');
    await refreshAnalysisPaths();
    await processAnalysisTopics({ logKind: 'analysis' });
  });
});
analysisTestRunBtn?.addEventListener('click', async () => {
  await withAnalysisBusy(async () => {
    clearAnalysisView('test');
    if (!activeAnalysisDatasetId) {
      analysisLogLine('Import or select a dataset first.', 'error');
      return;
    }
    if (!currentModel) {
      analysisLogLine('Select a model before running a test slice.', 'error');
      return;
    }
    try {
    analysisStopRequested = false;
    const settings = {
      ...currentAnalysisSettings(),
      testSlice: {
        mode: analysisTestMode?.value || 'random',
        count: Math.max(1, parseInt(analysisTestCount?.value || '5') || 5),
        start: Math.max(0, parseInt(analysisTestStart?.value || '0') || 0)
      }
    };
    const run = await window.api.analysisCreateRun(activeAnalysisDatasetId, settings);
    activeAnalysisRunId = run.run_id;
    localStorage.setItem(analysisStorageKey('activeAnalysisRunId'), activeAnalysisRunId);
    await loadAnalysisRuns();
    await refreshAnalysisPaths();
    activeAnalysisLogKind = 'test';
    const state = await window.api.analysisRunState(activeAnalysisDatasetId, activeAnalysisRunId);
    const selected = selectAnalysisTestChunks(state.chunks || []);
    if (!selected.length) {
      analysisLogLine('No chunks available. Build chunks first.', 'error');
      return;
    }
    const coverage = analysisCoverage(selected, state.chunks || []);
    const testStartedAt = performance.now();
    updateAnalysisMetrics({ coverage });
    analysisLogLine(`Created test run ${activeAnalysisRunId} with ${selected.length} selected chunks: ${selected.map(c => c.chunk_id).join(', ')}`);
    analysisLogLine(`Test coverage: ${coverage.selectedChunks}/${coverage.totalChunks} chunks (${coverage.chunkPct.toFixed(2)}%), ${compactNumber(coverage.selectedChars)}/${compactNumber(coverage.totalChars)} chars (${coverage.charPct.toFixed(2)}%), full corpus ~${coverage.multiplier.toFixed(1)}x this slice by chars.`);
    await processAnalysisTopics({ chunks: selected, label: 'test slice', coverage, totalStartedAt: testStartedAt, logKind: 'test' });
    if (!analysisStopRequested) await canonizeAnalysisRun({ totalStartedAt: testStartedAt, logKind: 'test' });
    if (!analysisStopRequested) {
      analysisLogLine(`Test slice finished in ${formatDuration(performance.now() - testStartedAt)}. Full corpus rough estimate: ${formatDuration((performance.now() - testStartedAt) * coverage.multiplier)} by selected-char multiplier.`);
      analysisResultLine('Test slice complete', [
        `duration ${formatDuration(performance.now() - testStartedAt)}`,
        `full estimate ${formatDuration((performance.now() - testStartedAt) * coverage.multiplier)}`,
        `${coverage.selectedChunks}/${coverage.totalChunks} chunks`,
        `${coverage.charPct.toFixed(2)}% chars`
      ]);
      updateAnalysisMetrics({
        coverage,
        totalElapsedMs: performance.now() - testStartedAt,
        lastPhaseName: 'Test slice',
        lastPhaseDurationMs: performance.now() - testStartedAt
      });
    }
    } catch (err) {
      analysisLogLine(`Test slice failed: ${err?.message || err}`, 'error');
      setAnalysisStatus('Test failed', 0);
    }
  });
});
analysisReprocessBtn?.addEventListener('click', () => {
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    analysisLogLine('Select a dataset and run first.', 'error');
    return;
  }
  showConfirmDialog(
    'Re-process topics for this run? This clears saved topic results, errors, canonization batches, and the exported graph, then starts the topic pass again. This can take a very long time.',
    async () => {
      await withAnalysisBusy(async () => {
        try {
          clearAnalysisView('analysis');
          analysisStopRequested = false;
          setAnalysisStatus('Resetting topics', 0);
          await window.api.analysisResetTopics(activeAnalysisDatasetId, activeAnalysisRunId);
          if (analysisOutputPath) analysisOutputPath.textContent = '';
          analysisLogLine('Cleared topic results and dependent canonization outputs.');
          await loadAnalysisRuns();
          await refreshAnalysisPaths();
          await processAnalysisTopics({ logKind: 'analysis' });
        } catch (err) {
          analysisLogLine(`Re-process reset failed: ${err?.message || err}`, 'error');
          setAnalysisStatus('Reset failed', 0);
        }
      });
    },
    'Re-process'
  );
});
analysisCanonizeBtn?.addEventListener('click', () => {
  withAnalysisBusy(async () => {
    clearAnalysisView('analysis');
    await refreshAnalysisPaths();
    await canonizeAnalysisRun({ logKind: 'analysis' });
  });
});
analysisRecanonizeBtn?.addEventListener('click', () => {
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    analysisLogLine('Select a dataset and run first.', 'error');
    return;
  }
  showConfirmDialog(
    'Re-canonize all topic results for this run? This clears saved canonization batches and the exported graph, then starts canonization again. This can take a very long time.',
    async () => {
      await withAnalysisBusy(async () => {
        try {
          clearAnalysisView('analysis');
          analysisStopRequested = false;
          setAnalysisStatus('Resetting canonization', 0);
          await window.api.analysisResetCanonization(activeAnalysisDatasetId, activeAnalysisRunId);
          if (analysisOutputPath) analysisOutputPath.textContent = '';
          analysisLogLine('Cleared canonization batches and exported graph.');
          await refreshAnalysisPaths();
          await canonizeAnalysisRun({ logKind: 'analysis' });
        } catch (err) {
          analysisLogLine(`Re-canonize reset failed: ${err?.message || err}`, 'error');
          setAnalysisStatus('Reset failed', 0);
        }
      });
    },
    'Re-canonize'
  );
});
analysisStopBtn?.addEventListener('click', () => {
  analysisStopRequested = true;
  setAnalysisStatus('Stopping', null);
  if (analysisProgressText) analysisProgressText.textContent = 'Stopping after the current model call finishes...';
  window.api.cancelMessage().catch(() => {});
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

function showConfirmDialog(message, onConfirm, confirmText = 'Delete') {
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
  confirmBtn.textContent = confirmText;
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
    renderReasoningInfo();
    renderSetupChecklist();
  } catch {
    setServerStatus('offline');
    populateModelSelects([]);
    populateSettingsModelSelect([]);
    renderReasoningInfo();
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
    ['Reasoning', inferReasoningCapability(modelId).state],
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
  renderReasoningInfo();
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
    renderReasoningInfo();
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

// ── Web search execution ─────────────────────────────────────────────────────────

function formatSearchContext(query, results) {
  const lines = results.map((r, i) => {
    const parts = [`[${i + 1}] ${r.title || r.url || 'Untitled'}`];
    if (r.url) parts.push(`URL: ${r.url}`);
    if (r.publishedDate) parts.push(`Published: ${r.publishedDate}`);
    const snippets = Array.isArray(r.highlights) ? r.highlights.filter(Boolean) : [];
    const body = (r.summary || snippets.join(' … ') || '').trim();
    if (body) parts.push(body);
    return parts.join('\n');
  });
  return `The user has web search enabled. Here are current web search results for the query "${query}". `
    + `Use them to inform your answer and cite sources as [n] with their URLs when relevant. `
    + `If they are not useful, rely on your own knowledge.\n\n`
    + lines.join('\n\n');
}

function renderSearchSources(query, results) {
  const div = document.createElement('div');
  div.className = 'message search-sources';

  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = `Web results for "${query}"`;
  div.appendChild(title);

  const list = document.createElement('ol');
  for (const r of results) {
    const li = document.createElement('li');
    if (r.url) {
      const a = document.createElement('a');
      a.href = r.url;
      a.textContent = r.title || r.url;
      li.appendChild(a);
    } else {
      li.textContent = r.title || 'Untitled';
    }
    list.appendChild(li);
  }
  div.appendChild(list);
  messagesEl.appendChild(div);
  return div;
}

// Guard injected when a search was attempted but produced nothing usable, so the
// model cannot pretend it searched the web.
function noSearchResultsGuard(query, reason) {
  return `Web search was enabled and attempted for the query "${query}", but it ${reason}. `
    + `You did NOT receive any web search results. Do not claim that you searched the web, `
    + `and do not cite or invent web sources or URLs. Answer from your own knowledge and note `
    + `that your information may be out of date.`;
}

// Returns a context string to inject, or null if no search was attempted
// (toggle off, empty query, or no API key).
async function runWebSearch(query) {
  if (!webSearchEnabled || !query) return null;
  if (!exaApiKey) {
    addMessage('error', 'Web search is on, but no Exa API key is set. Add one in Settings → General.');
    return null;
  }

  const status = document.createElement('div');
  status.className = 'message search-sources searching';
  status.textContent = `Searching the web for "${query}"…`;
  messagesEl.appendChild(status);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const result = await window.api.exaSearch(query, {
      apiKey: exaApiKey,
      numResults: exaNumResults,
    });
    status.remove();
    const results = Array.isArray(result?.results) ? result.results : [];
    if (results.length === 0) return noSearchResultsGuard(query, 'returned no results');
    renderSearchSources(query, results);
    return formatSearchContext(query, results);
  } catch (err) {
    status.remove();
    addMessage('error', `Web search failed: ${err?.message || err}`);
    return noSearchResultsGuard(query, `failed (${err?.message || err})`);
  }
}

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

  let webSearchContext = null;
  if (webSearchEnabled && text) {
    webSearchContext = await runWebSearch(text);
  }

  await streamAssistantResponse({
    forceImageDescriptionsForLastUser: shouldAnalyzeOutgoingImages,
    webSearchContext,
  });
}

async function streamAssistantResponse({ forceImageDescriptionsForLastUser = false, webSearchContext = null } = {}) {
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
    reasoningRequested: requestChatReasoning,
  };
  const requestHadImages = conversationHistory.some(messageHasImages);
  const apiMessages = buildApiMessagesForModel(conversationHistory, currentModel, { forceImageDescriptionsForLastUser });
  if (webSearchContext) {
    // Inject search results as a system message just before the last user turn.
    let lastUserIdx = -1;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === 'user') { lastUserIdx = i; break; }
    }
    const insertAt = lastUserIdx >= 0 ? lastUserIdx : apiMessages.length;
    apiMessages.splice(insertAt, 0, { role: 'system', content: webSearchContext });
  }
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
  if (result?.reasoningFallback) {
    addMessage('system', 'Reasoning controls were rejected by this server/model, so the chat request was retried without them.');
  }

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
