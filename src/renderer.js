marked.setOptions({ breaks: true, gfm: true });

// Defense-in-depth only: the page CSP (script-src 'self', no unsafe-inline) already
// blocks injected <script>/inline-handler execution, but there's no independent
// sanitization layer for markdown/LLM output rendered via innerHTML. This strips the
// well-known script-execution and navigation-hijack vectors before insertion, so a CSP
// relaxation, an <iframe>-class vector, or HTML smuggled in via a prompt-injected
// web-search result doesn't render live.
const SANITIZE_BLOCKED_SELECTOR = 'script, iframe, object, embed, form, link, meta, base, style, svg, math';
// Navigation attributes: any data: URI here can navigate the whole webview to an
// attacker-controlled HTML/SVG document, so data: is blocked here (not just javascript:).
const SANITIZE_NAV_ATTRS = new Set(['href', 'xlink:href', 'action', 'formaction']);
const SANITIZE_DANGEROUS_NAV_SCHEME = /^\s*(javascript|vbscript|data):/i;
// Resource attributes: data: is left alone here since the CSP already allows
// `img-src 'self' data:` for legitimate inline images.
const SANITIZE_SRC_ATTRS = new Set(['src']);
const SANITIZE_DANGEROUS_SCHEME = /^\s*(javascript|vbscript):/i;

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const root = template.content;

  // querySelectorAll returns a static snapshot, so removing an element mid-loop is
  // safe; its now-detached descendants are still visited but that's harmless (they
  // won't appear in the serialized output regardless of what happens to them here).
  for (const el of root.querySelectorAll('*')) {
    if (el.matches(SANITIZE_BLOCKED_SELECTOR)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (SANITIZE_NAV_ATTRS.has(name) && SANITIZE_DANGEROUS_NAV_SCHEME.test(attr.value)) {
        el.removeAttribute(attr.name);
      } else if (SANITIZE_SRC_ATTRS.has(name) && SANITIZE_DANGEROUS_SCHEME.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return template.innerHTML;
}

// ── LaTeX in model output ─────────────────────────────────────────────────────
// Nothing here renders math. marked passes `$\rightarrow$` through verbatim, and
// CommonMark silently EATS the backslash in `\(…\)` / `\[…\]`, so that form loses its
// delimiters and reads as ordinary parentheses. Local models — Gemma especially — reach
// for LaTeX arrows in prose whatever the system prompt says, and the concept-map layer
// makes it worse by pulling the model into an academic register. Rather than pull in a
// whole math engine for what is nearly always an arrow, map the macros that actually
// turn up in prose onto real Unicode and drop the delimiters. Runs before marked.parse;
// code fences and inline code are skipped, so `$VAR`, `C:\Users\x` and a `\[` inside a
// regex survive untouched.

const LATEX_SYMBOLS = {
  // Arrows — the overwhelming majority of what a chat answer actually emits.
  rightarrow: '→', to: '→', longrightarrow: '⟶', Rightarrow: '⇒', implies: '⇒',
  leftarrow: '←', gets: '←', longleftarrow: '⟵', Leftarrow: '⇐', impliedby: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', nearrow: '↗', searrow: '↘',
  // Operators
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘',
  oplus: '⊕', otimes: '⊗',
  // Relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼',
  simeq: '≃', cong: '≅', equiv: '≡', propto: '∝', ll: '≪', gg: '≫',
  // Sets and logic
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬',
  land: '∧', wedge: '∧', lor: '∨', vee: '∨', therefore: '∴', because: '∵',
  // Misc
  infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', int: '∫', sqrt: '√',
  degree: '°', dots: '…', ldots: '…', cdots: '⋯', vdots: '⋮', prime: '′', bullet: '•',
  // Greek — lowercase
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', pi: 'π',
  // Greek — uppercase
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const LATEX_SUPERSCRIPTS = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ',
};
const LATEX_SUBSCRIPTS = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋',
};

// Fenced blocks, inline code, and an unterminated fence — during streaming the closing
// fence has not arrived yet, but the contents are still code and must not be rewritten.
const MD_CODE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|```[\s\S]*$|~~~[\s\S]*$|`[^`\n]*`)/g;

// $$…$$ / $…$ / \(…\) / \[…\]. The single-$ form takes one of two shapes.
//
// 1. A compact algebraic body: no whitespace, at least one letter, and only characters that
//    appear in algebra. That covers everything the local models actually emit — "$N$", "$2N$",
//    "$n/2$", "$k=100$", "$O(N)$", "$x^2$", "$H_2O$" — all of which were observed leaking
//    through earlier versions of this rule across gemma-4-12b, -26b-a4b and -31b-qat.
// 2. A body carrying a macro, superscript or subscript, which may contain spaces
//    ("$T = N \times k$").
//
// The no-whitespace requirement in (1) is what keeps prices safe: in "$5 to $10" the span
// between the dollars is "5 to ", and in "$1,000 and $2,000" it is "1,000 and " — both have
// spaces, so neither can match. The letter requirement stops bare amounts ("$100$").
const MATH_SPAN_RE = /\$\$([\s\S]*?)\$\$|\$((?:(?=[^$\n]*[A-Za-z])[A-Za-z0-9()+\-*/=,.^_|]{1,24})|(?:[^$\n]*[\\^_][^$\n]*))\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;

// Wrappers whose whole job is styling literal words — unwrap to the words themselves.
const LATEX_TEXT_WRAPPER_RE =
  /\\(?:text|textbf|textit|textrm|textsf|mathrm|mathbf|mathit|mathsf|mathcal|mathbb|operatorname)\s*\{([^{}]*)\}/g;

function latexScriptChars(body, table) {
  const out = Array.from(body, ch => table[ch]);
  return out.every(Boolean) ? out.join('') : null;  // all-or-nothing: no half-converted runs
}

// Bare `\macro` → Unicode. Also the fallback for macros a model wrote with no delimiters
// at all ("A \rightarrow B"). `[A-Za-z]+` is greedy, so `C:\input` yields "input" (not a
// match) rather than mangling into `C:∈put`; only a path segment named exactly like a
// macro could collide, which is rare enough to accept.
function latexMacrosToUnicode(s) {
  return s.replace(/\\([A-Za-z]+)/g, (m, name) => LATEX_SYMBOLS[name] ?? m);
}

// The inside of one math span, flattened to plain text.
function demathBody(src) {
  // Escaped braces are literal content; park them so the grouping-brace sweep below
  // can't eat them.
  let s = src.replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002');

  for (let i = 0; i < 4 && LATEX_TEXT_WRAPPER_RE.test(s); i++) {  // innermost-out
    LATEX_TEXT_WRAPPER_RE.lastIndex = 0;
    s = s.replace(LATEX_TEXT_WRAPPER_RE, '$1');
  }
  LATEX_TEXT_WRAPPER_RE.lastIndex = 0;

  const fracPart = (part) => {
    const t = part.trim();
    return /^[\w.]*$/.test(t) ? t : `(${t})`;  // parenthesise anything compound
  };
  s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => `${fracPart(a)}/${fracPart(b)}`);

  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, '');
  s = s.replace(/\\(?:quad|qquad)\b/g, ' ').replace(/\\[,;:]/g, ' ').replace(/\\!/g, '').replace(/\\ /g, ' ');
  s = s.replace(/\\\\/g, '\n');  // LaTeX line break — safe here, since this is math only

  s = latexMacrosToUnicode(s);

  s = s.replace(/\^\{([^{}]+)\}|\^([^\s{}])/g, (m, braced, single) =>
    latexScriptChars(braced ?? single, LATEX_SUPERSCRIPTS) ?? m);
  s = s.replace(/_\{([^{}]+)\}|_([^\s{}])/g, (m, braced, single) =>
    latexScriptChars(braced ?? single, LATEX_SUBSCRIPTS) ?? m);

  s = s.replace(/\\[A-Za-z]+\s*\{([^{}]*)\}/g, '$1');  // any wrapper macro left over
  s = s.replace(/[{}]/g, '');                          // grouping braces
  s = s.replace(/\u0001/g, '{').replace(/\u0002/g, '}');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

// A `$` with no partner is an opener whose closer is still streaming in — leave that tail
// alone so the span pass takes charge of it once the rest arrives, instead of converting
// the macro early and stranding the delimiters.
function splitPendingMath(seg) {
  if (((seg.match(/\$/g) || []).length % 2) === 0) return [seg, ''];
  const idx = seg.lastIndexOf('$');
  return [seg.slice(0, idx), seg.slice(idx)];
}

function demathText(text) {
  if (!text || (!text.includes('$') && !text.includes('\\'))) return text;
  // One capture group in MD_CODE_RE, so split() puts code segments at the odd indices.
  return text.split(MD_CODE_RE).map((seg, i) => {
    if (i % 2 === 1) return seg;
    const [head, pending] = splitPendingMath(seg);
    const converted = head.replace(MATH_SPAN_RE, (m, dd, d, paren, bracket) =>
      demathBody(dd ?? d ?? paren ?? bracket));
    return latexMacrosToUnicode(converted) + pending;
  }).join('');
}

function renderMarkdown(text) {
  return sanitizeHtml(marked.parse(demathText(text || '')));
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
const analysisRunHealthBox = document.getElementById('analysis-run-health');
const analysisHealthVerdict = document.getElementById('analysis-health-verdict');
const analysisHealthMetrics = document.getElementById('analysis-health-metrics');
const analysisHealthNote = document.getElementById('analysis-health-note');
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
const analysisReconcilePathA = document.getElementById('analysis-reconcile-path-a');
const analysisReconcilePathB = document.getElementById('analysis-reconcile-path-b');
const analysisReconcileUseA = document.getElementById('analysis-reconcile-use-a');
const analysisReconcileUseB = document.getElementById('analysis-reconcile-use-b');
const analysisReconcileLlm = document.getElementById('analysis-reconcile-llm');
const analysisReconcileRunBtn = document.getElementById('analysis-reconcile-run-btn');
const analysisReconcileOpenBtn = document.getElementById('analysis-reconcile-open-btn');
const analysisReconcileOutput = document.getElementById('analysis-reconcile-output');
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
const settingsApiToken = document.getElementById('settings-api-token');
const settingsServerConnect = document.getElementById('settings-server-connect');
const settingsCtxWindow = document.getElementById('settings-ctx-window');
const settingsSystemPrompt  = document.getElementById('settings-system-prompt');
const settingsTemp      = document.getElementById('settings-temp');
const settingsTempValue = document.getElementById('settings-temp-value');
const settingsTempReset = document.getElementById('settings-temp-reset');
const settingsMaxTokens = document.getElementById('settings-max-tokens');
// Chat reasoning sits in the composer row, not the sidebar: the sidebar collapses and used
// to take the control with it. The Analysis one stays in the sidebar because the composer
// is hidden in Analysis mode.
const reasoningChatToggle = document.getElementById('reasoning-toggle');
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
const webSearchModeGroup = document.getElementById('web-search-mode');
const settingsExaKey    = document.getElementById('settings-exa-key');
const settingsExaResults = document.getElementById('settings-exa-results');
const settingsExaDeepPages = document.getElementById('settings-exa-deep-pages');
const settingsExaDeepChars = document.getElementById('settings-exa-deep-chars');
const conceptMapToggle  = document.getElementById('concept-map-toggle');
const cmMapSelect       = document.getElementById('cm-map-select');
const cmMapRefresh      = document.getElementById('cm-map-refresh');
const cmMapStatus       = document.getElementById('cm-map-status');
const cmModeSelect      = document.getElementById('cm-mode');
const cmArrangement     = document.getElementById('cm-arrangement');
const cmLevelsGroup     = document.getElementById('cm-levels');
const cmIncludeEvents   = document.getElementById('cm-include-events');
const cmMaxConcepts     = document.getElementById('cm-max-concepts');
const cmMaxChars        = document.getElementById('cm-max-chars');
const cmMinEvidence     = document.getElementById('cm-min-evidence');
const cmFraming         = document.getElementById('cm-framing');
const cmFramingReset    = document.getElementById('cm-framing-reset');
const cmExtractionGuidelines  = document.getElementById('cm-extraction-guidelines');
const cmCanonizationGuidelines = document.getElementById('cm-canonization-guidelines');
const libraryToggle     = document.getElementById('library-toggle');
const libSources        = document.getElementById('lib-sources');
const libMode           = document.getElementById('lib-mode');
const libMaxChars       = document.getElementById('lib-max-chars');
const libPreview        = document.getElementById('lib-preview');
const libStatus         = document.getElementById('lib-status');
const libSemantic       = document.getElementById('lib-semantic');
const libSearchUrl      = document.getElementById('lib-search-url');
const historyToggle     = document.getElementById('history-toggle');
const histMode          = document.getElementById('hist-mode');
const histDays          = document.getElementById('hist-days');
const histMaxEntries    = document.getElementById('hist-max-entries');
const histMaxChars      = document.getElementById('hist-max-chars');
const histIncludeChrome = document.getElementById('hist-include-chrome');
const histProfiles      = document.getElementById('hist-profiles');
const histPreview       = document.getElementById('hist-preview');
const histStatus        = document.getElementById('hist-status');
const hermesToggle      = document.getElementById('hermes-toggle');
const hermesRootInput   = document.getElementById('hermes-root');
const hermesTiersGroup  = document.getElementById('hermes-tiers');
const hermesMaxTopicsEl = document.getElementById('hermes-max-topics');
const hermesMaxCharsEl  = document.getElementById('hermes-max-chars');
const hermesPreview     = document.getElementById('hermes-preview');
const hermesStatus      = document.getElementById('hermes-status');

// ── State ─────────────────────────────────────────────────────────────────────

// ── Persisted-setting defaults ────────────────────────────────────────────────
// What a Settings tab shows before the user has touched it. These matter far more here
// than in a normal web app: `tauri dev` serves the frontend on the first free port from
// 1430 up, so a launch while another Tauri app holds 1430 lands on 1431, 1432, … — and
// each port is a *separate web origin with its own empty localStorage*. The release build
// (tauri://localhost) is yet another. So every settings-losing "reset after a patch" is
// really a dev run that came up on a port it had never used before, as a fresh install.
// Keeping these in step with the real configuration is what makes that harmless.
//
// Defaults only — localStorage still wins the moment the user changes something. Secrets
// are deliberately NOT here: the Exa key lives in a file under app-data (initExaApiKey),
// both because source is the wrong place for it and because a file is origin-independent.
// Neither are the settings that name a folder on THIS machine — librarySources,
// conceptMapPath, historyProfiles, hermesRoot. A default cannot help those (a real path
// must not ship in a public repo), so they were the ones that actually kept resetting;
// they are file-backed for the same origin-independence reason, see initMachinePaths.
const DEFAULTS = {
  // General
  serverUrl: 'http://localhost:1234',
  selectedModel: 'google/gemma-4-26b-a4b',
  temperature: '0.7',
  theme: 'amber',
  msgMaxWidth: '85',
  sidebarVisible: '0',
  // Image analysis / vision
  imageAnalysisModel: 'google/gemma-4-26b-a4b',
  modelVisionOverrides: JSON.stringify({
    'nvidia/nemotron-3-nano-4b': 'no',
    'google/gemma-4-26b-a4b': 'yes',
    'nvidia/nemotron-3-nano-omni': 'yes',
    'nvidia/nemotron-3-super': 'no',
  }),
  // Web search (Exa) — the key itself is file-backed, see initExaApiKey
  webSearchMode: 'off',
  exaNumResults: '10',
  webDeepMaxPages: '6',
  webDeepCharsPerPage: '6000',
  // Concept map memory
  conceptMapEnabled: '1',
  // Empty on purpose: an absolute path here only exists on one machine, and anyone else
  // running this would get an error on their first message. Blank means "use the newest
  // graph on disk" — see cmResolvePath.
  conceptMapPath: '',
  conceptMapMode: 'overview',
  conceptMapArrangement: 'hierarchy',
  conceptMapLevels: 'macro,topic',
  conceptMapMaxConcepts: '2000',
  conceptMapMaxChars: '200000',
  conceptMapMinEvidence: '3',
  conceptMapIncludeEvents: '0',
  // Local library
  libraryEnabled: '0',
  libraryMode: 'relevant',
  librarySources: '',  // machine-specific → file-backed, see initMachinePaths
  libraryMaxChars: '24000',
  // Semantic ordering via a local vault-search service, if one is running. A loopback
  // URL is portable in a way a filesystem path is not, so unlike librarySources this
  // belongs in DEFAULTS: on a machine with nothing on 5278 the first probe fails, the
  // feature latches off for the session, and the lexical path runs exactly as before.
  librarySemantic: '1',
  librarySearchUrl: 'http://127.0.0.1:5278',
  // Browser history
  historyEnabled: '1',
  historyMode: 'relevant',
  historyDays: '30',
  historyMaxEntries: '500',
  historyMaxChars: '16000',
  historyIncludeChrome: '0',
  // Hermes warm memory — off until explicitly turned on, and the root stays blank so it
  // resolves to <home>/Hermes-General rather than shipping one machine's absolute path.
  hermesEnabled: '0',
  hermesRoot: '',
  // active/ is implicit and always searched; this holds only the tiers whose material is
  // NOT current evidence, which is why the default is none of them.
  hermesTiers: '',
  hermesMaxTopics: '5',
  hermesMaxChars: '9000',
  // Data Analysis
  analysisProfile: 'fast',
  activeAnalysisSource: 'anthropic',
};

// `??`, not `||`: a key the user has never set is null and takes the default, but one they
// deliberately cleared to '' stays cleared instead of springing back to the default.
function pref(key) {
  return localStorage.getItem(key) ?? DEFAULTS[key] ?? '';
}
function prefInt(key) {
  const n = parseInt(pref(key), 10);
  return Number.isFinite(n) ? n : 0;
}
function prefBool(key) {
  return pref(key) === '1';
}

let MODELS = {};
let currentModel = pref('selectedModel') || null;
let imageAnalysisModel = pref('imageAnalysisModel');
let analyzeImagesBeforeSend = false;
let useCurrentModelForImageAnalysis = localStorage.getItem('useCurrentModelForImageAnalysis') !== '0';
let includeImageAnalysisInContext = localStorage.getItem('includeImageAnalysisInContext') === '1';
let currentContextWindow = parseInt(localStorage.getItem('contextWindow') || '0');
// Size of the context layers spliced in on the last send. They are rebuilt per message and
// live only inside streamAssistantResponse, so they never reached the context bar — which
// then read ~2k tokens for a prompt whose concept map alone was ~44k. Carrying the last
// measured figure is approximate between sends, but it is the difference between a bar
// that is roughly right and one that is wrong by 20x. Declared up here with the rest of
// the state so updateContextBar() can never touch it in its temporal dead zone.
let lastContextSourceTokens = 0;
let serverUrl = pref('serverUrl');
let serverOnline = false;
let systemPrompt = localStorage.getItem('systemPrompt') || '';
let currentTemp = parseFloat(pref('temperature'));
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
// The model LM Studio currently has loaded, as far as we know. Used to avoid firing
// redundant load requests (returning to a chat, or clicking between chats, must not
// keep reloading — or pile up several models in LM Studio). Best-effort belief: if it's
// wrong, a send simply JIT-loads the model server-side and we recover.
let loadedModel = null;
// Web search depth: 'off' | 'quick' (1 smart query, summaries) | 'deep' (multi-query, full page text).
// Migrate the old boolean flag: previously-on becomes 'quick'.
let webSearchMode = localStorage.getItem('webSearchMode')
  || (localStorage.getItem('webSearchEnabled') === '1' ? 'quick' : DEFAULTS.webSearchMode);
if (!['off', 'quick', 'deep'].includes(webSearchMode)) webSearchMode = 'off';
let lastWebSearchOnMode = webSearchMode === 'off' ? 'quick' : webSearchMode; // restored when re-enabling
// Backed by exa-api-key.txt under app-data, not localStorage — see initExaApiKey. This
// starts empty and is filled in during init(); nothing reads it before a search runs.
let exaApiKey = '';
let exaNumResults = prefInt('exaNumResults');
// Deep-mode budget. Built for 256k-context local models with a 50–250k-token/chat ceiling in mind.
let webDeepMaxPages = prefInt('webDeepMaxPages');   // pages to inject full text for
let webDeepCharsPerPage = prefInt('webDeepCharsPerPage');
const WEB_DEEP_MAX_QUERIES = 4;  // decomposition ceiling for deep mode

// ── Injected-context preamble ─────────────────────────────────────────────────
// Precedes all five context sources, whichever are on. A system message full of search
// results is indistinguishable from tool output unless something says otherwise, and with
// no system prompt set there is nothing to say otherwise — so a "test the tools" style
// prompt gets answered with an invented execution trace: a Python interpreter that does
// not exist, a query that was never run, SUCCESS/latency telemetry for none of it. The
// prohibitions are spelled out one by one rather than stated in general because that is
// what local models actually follow.
// One name per source, used for the composer button tooltip, the in-chat note heading, and
// the heading the model reads. Three surfaces, one string — so "what the user toggled",
// "what the app injected" and "what the model was told it is" cannot drift apart.
const CONTEXT_SOURCES = {
  web:     'Web search',
  map:     'Concept map',
  library: 'Local library',
  history: 'Browser history',
  hermes:  'Hermes warm memory',
};

// Sent on every request, whether or not any source is active, and worded so it is true
// either way. Both properties are deliberate. Unconditional, because testing found the model
// confabulates tool state worst when NOTHING is attached — with all sources off it invented
// an Active/Degraded/Unavailable status table for tools it does not have; the preamble is
// the only thing that stops that, and it used to be omitted in exactly that case. Constant,
// because it sits at index 0: text that changed with the source count would invalidate the
// cached prompt prefix — and the primed map behind it — every time a toggle moved.
const CS_PREAMBLE_HEAD = `Any reference material in this conversation appears as blocks headed "Context source: <name>". Those blocks were gathered by this application before you were called and placed into your context; they are not results you produced. If no such block is present, you have only this conversation and your own knowledge.`;

const CS_PREAMBLE_NO_TOOLS = `You have no tools. You cannot search the web, browse, open URLs, run code, execute Python, query a database, or read files on demand — and you cannot observe the status, latency, environment or output of any such tool, because none ran. Never describe yourself as having called, invoked, run, orchestrated or monitored a tool. Never report tool status, execution traces, phases, or telemetry, even hypothetically or as an illustration.`;

// Swapped in for the paragraph above when concept_search is genuinely attached (the concept
// map's on-demand mode). The denial has to be narrowed rather than dropped: the confabulation
// it prevents is about *other* tools, and a model handed one real function will otherwise
// narrate a whole toolchain around it. Everything either variant says stays literally true of
// the request it ships with, which is the only reason this preamble works at all.
const CS_PREAMBLE_ONE_TOOL = `You have exactly one tool: concept_search, which looks up entries in the user's own concept map. Call it when the answer depends on what this particular user works on or already knows, and answer directly when it does not. It is your only tool — you cannot search the web, browse, open URLs, run code, execute Python, query a database, or read files, and you cannot observe the status, latency or environment of any tool. Never describe yourself as having called, invoked, run, orchestrated or monitored anything other than concept_search, and never report tool status, execution traces, phases, or telemetry.`;

const CS_PREAMBLE_TAIL = `If you are asked about your tools or their state, answer plainly: name the context sources you were given and say that the application retrieved them for you. Anything not present in this context or in your own knowledge, you do not know — say so instead of constructing a plausible account of it.`;

const CONTEXT_SOURCES_PREAMBLE = [CS_PREAMBLE_HEAD, CS_PREAMBLE_NO_TOOLS, CS_PREAMBLE_TAIL].join('\n\n');
// The variant is chosen per request from whether tools are attached, not per turn, so within
// one chat it is still byte-identical and the prefix stays cacheable. It only changes when the
// user changes concept-map mode mid-chat, which already invalidates the prefix anyway.
const CONTEXT_SOURCES_PREAMBLE_TOOL = [CS_PREAMBLE_HEAD, CS_PREAMBLE_ONE_TOOL, CS_PREAMBLE_TAIL].join('\n\n');

// Header every source block carries, so the name the model reads is the same name the user
// clicked and the same name on the note in the transcript.
function contextSourceHeader(key) {
  return `## Context source: ${CONTEXT_SOURCES[key]}`;
}

// ── Concept map memory (local analysis graphs as conceptual anchors) ──────────────
// Experimental: inject a map of the user's own concepts (from Data Analysis output
// graphs) so the model can calibrate what the user knows. In overview mode the map primes
// the chat once (buildConceptMapPrime) and later messages get a small relevant slice
// (buildConceptMapSlice); relevant mode injects a fresh selection every message instead;
// on-demand mode injects nothing at all and hands the model a concept_search function to
// pull entries with (cmConceptSearch, driven by the tool loop in streamAssistantResponse).
const CM_MODES = ['overview', 'relevant', 'ondemand'];
let conceptMapEnabled = prefBool('conceptMapEnabled');
let conceptMapPath = pref('conceptMapPath');
let conceptMapMode = CM_MODES.includes(pref('conceptMapMode')) ? pref('conceptMapMode') : 'overview';
// Overview arrangement, mirroring the 3D vector-map viewer's layouts: 'hierarchy' (tree),
// 'salience' (most-referenced first, like its "size" layout), 'alpha'.
let conceptMapArrangement = ['hierarchy', 'salience', 'alpha'].includes(pref('conceptMapArrangement'))
  ? pref('conceptMapArrangement') : 'hierarchy';
let conceptMapLevels = pref('conceptMapLevels')
  .split(',').map(s => s.trim()).filter(Boolean);
let conceptMapIncludeEvents = prefBool('conceptMapIncludeEvents');
let conceptMapMaxConcepts = prefInt('conceptMapMaxConcepts');
// A ceiling for pathological graphs, NOT an operating parameter. It is deliberately set
// well above normal use (a full macro+topic map here is ~117k) because the trim is crude:
// salience correlates with evidence, evidence correlates with level, so cutting the tail
// of a ranked list is in practice a level filter — at 40k it removed 92% of topic entries
// while keeping every macro one. Fine as a last resort against a runaway map, wrong as a
// routine size control. Use minimum evidence and the level checkboxes for that.
let conceptMapMaxChars = prefInt('conceptMapMaxChars');
// Drop concepts the map barely knows anything about. cmEvidenceWeight is records + chunks,
// so weight 2 is a single mention — and single mentions are how incidental nouns ("AI &
// Technology", "AI Model Integration") end up presented as part of the user's conceptual
// space. 3 excludes exactly those: it costs ~6% of the payload and removes 72 entries.
let conceptMapMinEvidence = prefInt('conceptMapMinEvidence');
let conceptGraphCache = { path: null, graph: null };  // avoid re-reading the graph each turn
// The full map as rendered for the current chat, frozen at first send and re-sent verbatim
// at the head of every request afterwards. Frozen rather than rebuilt because a prompt
// prefix only stays cacheable while it is byte-identical, and because the model should not
// be primed with one map and then quietly handed a different one mid-conversation. Cleared
// on new/loaded chats, and re-primed if a setting that changes the rendering is edited —
// tracked by signature rather than cleared from each settings listener, so a setting added
// later cannot silently leave a stale prime behind.
let primedConceptMap = null;
let primedConceptMapSig = '';
// On-demand mode forces reasoning off (see the tool loop). Say so once per chat rather than
// on every send — it is a standing consequence of the mode, not a per-message event.
let cmToolReasoningNoticed = false;
// Which graph an empty conceptMapPath resolved to last time, so the prime signature can
// notice when "newest on disk" starts pointing somewhere else.
let conceptMapAutoPath = '';

function cmPrimeSignature() {
  return [
    conceptMapPath || conceptMapAutoPath, conceptMapArrangement, conceptMapLevels.join(','),
    conceptMapMaxConcepts, conceptMapMaxChars, conceptMapMinEvidence,
    conceptMapIncludeEvents ? 1 : 0, conceptMapFraming,
  ].join('|');
}

// An explicit choice wins; otherwise pick a graph off disk. analysis_list_graphs already
// sorts newest-first, so it is the head of the list — but reconciliations are preferred over
// single-run outputs. A reconciliation is a deliberate union of runs, and it is what a map
// is normally pinned to; without this preference the next Data Analysis run would silently
// swap the whole chat over to that one run's narrower graph just for being newer.
// This is what makes "concept map on by default" work on a machine that has never opened
// Settings, and what lets the default stay free of anyone's absolute paths.
async function cmResolvePath() {
  if (conceptMapPath) return conceptMapPath;
  try {
    const res = await window.api.analysisListGraphs();
    const graphs = Array.isArray(res?.graphs) ? res.graphs : [];
    const pick = graphs.find(g => g.kind === 'reconciliation') || graphs[0];
    conceptMapAutoPath = pick?.path || '';
  } catch {
    conceptMapAutoPath = '';
  }
  return conceptMapAutoPath;
}

// Default text describing the concept map when it is injected as memory. User-tunable in Settings → Concept map.
// "Connect your answer to their existing concepts where relevant" used to end this
// paragraph, and it is an invitation the model accepts too readily. Measured 2026-08-09
// against gemma-4-26b: a plain "how do I structure error handling in a Tauri command"
// answered correctly for 700 tokens and then closed with a "Why this structure works for
// your workflow" section asserting "your preference for high-quality, distinctive
// interfaces" — which is the verbatim summary of the map entry "Frontend Design
// Principles", recited back as a preference the user never stated. The map records what
// somebody has discussed, not what they want, and nothing in it licenses telling them what
// they prefer. The earlier finding that priming launders less than relevant mode still
// holds; this is the residue of it, and it surfaces in the epilogue of a long answer, which
// is why a short-answer test missed it. Calibration is kept, commentary is not.
const CM_BASE_FRAMING = `The following is a map of the user's own conceptual space, distilled by this app's Data Analysis from their past conversations — the topics they think about and how those relate. Treat it as background on what the user is likely already familiar with, and use it to calibrate how much you explain. It is not the user's current question, not facts to recite, and not a record of what they want. Do not quote or paraphrase its entries back at them, do not tell them what they prefer or believe, and do not add a section explaining how your answer relates to their concepts. Where a real overlap makes the answer better, let it show in the depth and wording you choose, not in commentary about them. If it isn't relevant to the message, ignore it entirely.`;
// The formatting rule rides along with the map rather than living in the system prompt
// because the map is what triggers the problem: a thousand lines of framework vocabulary
// pull the model into an academic register where LaTeX arrows are a likely continuation.
// demathText() cleans up whatever slips through anyway.
const CM_FORMAT_CLAUSE = `Formatting: this chat renders plain Markdown and has no math renderer. Never use LaTeX — no $...$, $$...$$, \\(...\\) or \\[...\\] delimiters, and no macros such as \\rightarrow, \\times or \\text{...}. Write symbols directly as Unicode instead: → ⇒ ↔ × ÷ ≤ ≥ ≠ ≈ ∈ ∞.`;
const CM_DEFAULT_FRAMING = `${CM_BASE_FRAMING}\n\n${CM_FORMAT_CLAUSE}`;
// Framings that were the default, or were pasted in by hand, before the current one. A
// stored copy of any of these means the user is not actually carrying a customisation, so
// let the current default supersede it rather than freezing them on an older version.
// Anything they genuinely wrote themselves is left untouched.
const CM_LEGACY_FRAMINGS = [
  CM_BASE_FRAMING,  // same text, before the formatting clause was appended to it
  // The 2026-07-26 default, retired 2026-08-09 for inviting the model to narrate the
  // connection between its answer and the user's concepts. Listed both bare and with the
  // formatting clause, since that is how it was stored depending on when it was saved.
  `The following is a map of the user's own conceptual space, distilled by this app's Data Analysis from their past conversations — the topics they think about and how those relate. Treat it as background on what the user is likely already familiar with and the directions of their thinking. It is not the user's current question and not facts to recite. Use it to calibrate depth, and connect your answer to their existing concepts where relevant. If it isn't relevant to the message, ignore it.`,
  `The following is a map of the user's own conceptual space, distilled by this app's Data Analysis from their past conversations — the topics they think about and how those relate. Treat it as background on what the user is likely already familiar with and the directions of their thinking. It is not the user's current question and not facts to recite. Use it to calibrate depth, and connect your answer to their existing concepts where relevant. If it isn't relevant to the message, ignore it.\n\n${CM_FORMAT_CLAUSE}`,
  `The following is a map of the user's own conceptual space, distilled by this app's Data Analysis from their PAST conversations — the topics they think about and how those relate. Treat it as background on what the user is likely already familiar with and the directions of their thinking. It is NOT the user's current question and NOT facts to recite. Use it to calibrate depth, avoid over-explaining what they clearly know, and connect your answer to their existing concepts where relevant. If it isn't relevant to the message, ignore it.`,
];
const cmStoredFraming = (localStorage.getItem('conceptMapFraming') || '').trim();
let conceptMapFraming = (cmStoredFraming && !CM_LEGACY_FRAMINGS.includes(cmStoredFraming))
  ? cmStoredFraming
  : CM_DEFAULT_FRAMING;
// Extra guidelines appended to the Data Analysis concept-map generation prompts (empty = built-in defaults only).
let conceptMapExtractionGuidelines = localStorage.getItem('conceptMapExtractionGuidelines') || '';
let conceptMapCanonizationGuidelines = localStorage.getItem('conceptMapCanonizationGuidelines') || '';

// ── Local library memory (notes/text folders & files as a third context layer) ────
// The user points at folders/files (their notes vault, exported texts); the model reads
// them directly as source material. See buildLibraryContext.
let libraryEnabled = prefBool('libraryEnabled');
let libraryMode = pref('libraryMode');  // 'relevant' | 'all'
let librarySourcesText = pref('librarySources');
let libraryMaxChars = prefInt('libraryMaxChars');
let librarySemantic = prefBool('librarySemantic');
let librarySearchUrl = pref('librarySearchUrl');
const LIBRARY_FRAMING = `The following is content from the user's own local library — notes and source texts they have placed in specific folders/files for you to use directly. Treat it as authoritative, user-provided material and draw on it when it is relevant to the message; refer to the file name when you use something from it. If a piece isn't relevant to the message, ignore it.`;
// Read caps handed to the Rust library_collect command (per-message; JS then trims to budget).
const LIBRARY_COLLECT_OPTS = { maxFiles: 400, maxTotalChars: 2000000, maxFileChars: 200000 };

// ── Browser history memory (Vivaldi/Chrome Chromium history as a context layer) ────
// A fourth context layer, beside web/concept-map/library: read the user's own local
// browser history (like the chromium-history-timeline app) and inject what they've
// recently been looking at. Read fresh & read-only each message; nothing is persisted.
// See buildHistoryContext.
let historyEnabled = prefBool('historyEnabled');
let historyMode = pref('historyMode');  // 'relevant' | 'recent'
let historyDays = prefInt('historyDays');
let historyMaxEntries = prefInt('historyMaxEntries');
let historyMaxChars = prefInt('historyMaxChars');
let historyIncludeChrome = prefBool('historyIncludeChrome');
let historyProfilesText = localStorage.getItem('historyProfiles') || '';
const HISTORY_FRAMING = `The following is a compact set of entries from the user's own local browser history (Vivaldi/Chrome), retrieved as background on what they've recently been looking at online. Treat it as context about the user's recent activity and interests — it is NOT the user's current question and NOT facts to recite. Use it to ground your answer in what they've been doing when it's relevant; if it isn't relevant to the message, ignore it. Each entry is a page they visited: title, URL, and (last-visit time · visit count).`;
// Rows the Rust side scans before the JS re-ranks/trims to the entry & char budget.
const HISTORY_SCAN_LIMIT = 4000;

// ── Hermes warm memory (the Hermes agent's cross-project topic notes) ─────────────
// A fifth context source, and the only one whose material carries an explicit evidentiary
// standing of its own. The Hermes-General workspace sorts documents into tiers, and the
// tier is not filing — it says how a claim in that document may be used. Everything below
// exists to keep that intact across the trip into the prompt: the tier travels with each
// document, only `active/` is searched unless the user opts in, non-active tiers must
// actually match the message before they appear at all, and freshness is read from the
// document's own `information_as_of` rather than from the file's mtime (the workspace
// rewrites documents long after the observations they record).
// Read-only in every direction: nothing in this app writes to that workspace.
// See buildHermesContext, and C:\Users\slaur\Hermes-General\CLAUDE.md for the contract.
const HERMES_TIERS = ['active', 'parked', 'inbox', 'archive'];
// The standing that ships next to every document, in the words the model has to apply.
// Keyed by tier so a document can never be rendered without one.
const HERMES_TIER_STANDING = {
  active:  'current topic — still point-in-time, judge it by the dates below',
  parked:  'HISTORICAL until revalidated — present tense here describes what was true then',
  archive: 'HISTORICAL — retained for provenance, not as a current claim',
  inbox:   'UNTRIAGED — not evidence, may be wrong or superseded',
};
let hermesEnabled = prefBool('hermesEnabled');
let hermesRoot = pref('hermesRoot');
// Only the optional tiers live here; 'active' is added at request time and cannot be
// switched off, because a Hermes read with no active tier is not a smaller read — it is
// one made entirely of material that is not current.
let hermesTiers = pref('hermesTiers').split(',').map(s => s.trim()).filter(t => HERMES_TIERS.includes(t) && t !== 'active');
let hermesMaxTopics = prefInt('hermesMaxTopics');
let hermesMaxChars = prefInt('hermesMaxChars');
// Per-document read cap handed to Rust. Generous: the trimming that matters is the excerpt
// selection below, and a document truncated mid-read would lose the closing sections where
// this workspace puts its decisions.
const HERMES_COLLECT_OPTS = { maxFilesPerTier: 40, maxFileChars: 60000 };
const HERMES_FRAMING = `The following is a read-only view of the Hermes agent's warm-memory workspace — cross-project notes, assessments and decision records kept outside this app. This application retrieved it; you did not, and neither did the user in this chat.

How to weigh it, in order:

1. A live check outranks every document here. Report what a document recorded and when — never restate an old observation as the current state of anything.
2. Judge age by the "information as of" stamp shown with each document, never by how recently a file changed. A document marked "review due" is stale until someone revalidates it.
3. The tier shown with each document is its standing, not its location. Only "active" holds current topics. Anything marked parked, archive or inbox is historical or untriaged — treat it as what was thought at that time, even where it is written in the present tense, and never as evidence for what is true now.
4. Ideas are not evidence, and a decision record says what was decided then, not necessarily what applies now.
5. The "sources" line is where that document's claims came from. If a claim matters, say which document carried it.

If none of it bears on the message, ignore it. Do not fill gaps in it — a topic that is not here is one the workspace does not cover.`;
let analysisDatasets = [];
let analysisRuns = [];
let activeAnalysisSource = ['anthropic', 'openai', 'grok'].includes(pref('activeAnalysisSource'))
  ? pref('activeAnalysisSource')
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
  theme = theme || pref('theme');
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

applyMsgWidth(prefInt('msgMaxWidth'));

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

// The key field is filled in by initExaApiKey() once the backend has handed it over.
if (settingsExaResults) settingsExaResults.value = exaNumResults;
if (settingsExaDeepPages) settingsExaDeepPages.value = webDeepMaxPages;
if (settingsExaDeepChars) settingsExaDeepChars.value = webDeepCharsPerPage;

settingsExaKey?.addEventListener('change', () => {
  exaApiKey = settingsExaKey.value.trim();
  window.api.setExaApiKey(exaApiKey).catch(() => {});
});

// The Exa key is persisted by the backend in exa-api-key.txt under app-data, the same way
// the server URL and bearer token are, rather than in localStorage — localStorage belongs
// to a web origin, and `tauri dev` hands out a new origin whenever it lands on a different
// port, which is what kept wiping the key after a frontend change. Also migrates a key
// still held in this origin's localStorage from before the switch.
async function initExaApiKey() {
  try {
    let key = await window.api.getExaApiKey();
    const carriedOver = (localStorage.getItem('exaApiKey') || '').trim();
    if (!key && carriedOver) {
      key = carriedOver;
      await window.api.setExaApiKey(key);
    }
    // Once the file holds it, drop the copy here: no reason to leave a secret in webview storage.
    if (carriedOver) localStorage.removeItem('exaApiKey');
    exaApiKey = key || '';
  } catch {}
  if (settingsExaKey) settingsExaKey.value = exaApiKey;
}

// ── Machine-specific paths (origin-independent, like the Exa key) ───────────────────
// The settings that name a folder on THIS machine. They are the ones that visibly "reset
// after a code change", and for a reason none of the others share: every other setting has
// a default in DEFAULTS that makes a new web origin harmless, but a machine-specific path
// must never be a default in a public repo — so when `tauri dev` lands on a new port, or
// the release build (`tauri://localhost`) is opened instead, there is nothing to restore
// them from. Measured: four origins had accumulated on this machine, and only one of them
// held librarySources.
//
// So they live in machine-paths.json under app-data, which every origin sees. localStorage
// is still written, because the rest of the app reads these through pref() at load; the
// file is what makes them survive.
const MACHINE_PATH_KEYS = ['librarySources', 'conceptMapPath', 'historyProfiles', 'hermesRoot'];

function saveMachinePath(key, value) {
  localStorage.setItem(key, value);
  window.api.setMachinePath(key, value).catch(() => {});   // never block a settings edit
}

async function initMachinePaths() {
  let stored = {};
  try {
    stored = (await window.api.getMachinePaths()) || {};
  } catch {
    return;   // no bridge (or an unreadable file) — localStorage still works as before
  }
  for (const key of MACHINE_PATH_KEYS) {
    const fromFile = String(stored[key] ?? '').trim();
    const fromOrigin = (localStorage.getItem(key) || '').trim();
    // The file wins when it has a value. When it does not, an origin that still holds one
    // seeds it — that is the migration, and it runs from whichever origin was configured
    // first, so nobody has to re-enter what they already set.
    if (fromFile) {
      if (fromFile !== fromOrigin) localStorage.setItem(key, fromFile);
    } else if (fromOrigin) {
      window.api.setMachinePath(key, fromOrigin).catch(() => {});
      continue;   // already live in this origin
    } else {
      continue;
    }
    applyMachinePath(key, fromFile);
  }
}

// Push a value the file supplied into the live variable and its settings field. Only the
// four keys above reach here, and each is handled explicitly rather than through a lookup
// table, so adding a fifth cannot silently do nothing.
function applyMachinePath(key, value) {
  if (key === 'librarySources') {
    librarySourcesText = value;
    if (libSources) libSources.value = value;
  } else if (key === 'conceptMapPath') {
    conceptMapPath = value;
    conceptGraphCache = { path: null, graph: null };   // a different graph than we loaded
    if (cmMapSelect) cmMapSelect.value = value;
  } else if (key === 'historyProfiles') {
    historyProfilesText = value;
    if (histProfiles) histProfiles.value = value;
  } else if (key === 'hermesRoot') {
    hermesRoot = value;
    if (hermesRootInput) hermesRootInput.value = value;
  }
}

settingsExaResults?.addEventListener('change', () => {
  const val = Math.min(10, Math.max(1, parseInt(settingsExaResults.value) || 5));
  exaNumResults = val;
  settingsExaResults.value = val;
  localStorage.setItem('exaNumResults', val);
});

settingsExaDeepPages?.addEventListener('change', () => {
  const val = Math.min(20, Math.max(1, parseInt(settingsExaDeepPages.value) || 6));
  webDeepMaxPages = val;
  settingsExaDeepPages.value = val;
  localStorage.setItem('webDeepMaxPages', val);
});

settingsExaDeepChars?.addEventListener('change', () => {
  const val = Math.min(30000, Math.max(1000, parseInt(settingsExaDeepChars.value) || 6000));
  webDeepCharsPerPage = val;
  settingsExaDeepChars.value = val;
  localStorage.setItem('webDeepCharsPerPage', val);
});

function setWebSearchMode(mode) {
  if (!['off', 'quick', 'deep'].includes(mode)) mode = 'off';
  webSearchMode = mode;
  if (mode !== 'off') lastWebSearchOnMode = mode;
  localStorage.setItem('webSearchMode', mode);
  applyWebSearchUI();
  if (mode !== 'off' && !exaApiKey) {
    addMessage('error', 'Web search is on, but no Exa API key is set. Add one in Settings → General.');
  }
}

function applyWebSearchUI() {
  const on = webSearchMode !== 'off';
  if (webSearchToggle) {
    webSearchToggle.classList.toggle('active', on);
    webSearchToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    webSearchToggle.title = on
      ? `Context source: ${CONTEXT_SOURCES.web} (${webSearchMode}) — click to turn off`
      : `Context source: ${CONTEXT_SOURCES.web} — off`;
  }
  if (webSearchModeGroup) {
    webSearchModeGroup.classList.toggle('hidden', !on);
    for (const btn of webSearchModeGroup.querySelectorAll('button[data-mode]')) {
      const active = on && btn.dataset.mode === webSearchMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }
}

// Toggle button flips off ↔ last-used depth (defaults to quick).
webSearchToggle?.addEventListener('click', () => {
  setWebSearchMode(webSearchMode === 'off' ? lastWebSearchOnMode : 'off');
});

// Quick / Deep segment picks the depth (and turns search on).
webSearchModeGroup?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  setWebSearchMode(btn.dataset.mode);
});

applyWebSearchUI();

// ── Concept map memory: composer toggle + settings ────────────────────────────────

function applyConceptMapToggle() {
  if (!conceptMapToggle) return;
  conceptMapToggle.classList.toggle('active', conceptMapEnabled);
  conceptMapToggle.setAttribute('aria-pressed', conceptMapEnabled ? 'true' : 'false');
  conceptMapToggle.title = `Context source: ${CONTEXT_SOURCES.map} — ${conceptMapEnabled ? 'on' : 'off'}`;
}

conceptMapToggle?.addEventListener('click', async () => {
  conceptMapEnabled = !conceptMapEnabled;
  localStorage.setItem('conceptMapEnabled', conceptMapEnabled ? '1' : '0');
  applyConceptMapToggle();
  // Only complain when there is genuinely nothing to use. With no explicit selection the
  // newest graph on disk is used, so an empty conceptMapPath is not by itself a problem.
  if (conceptMapEnabled && !(await cmResolvePath())) {
    addMessage('error', 'Concept map memory is on, but there are no concept maps on disk yet. Run Data Analysis to build one, or pick a map in Settings → Concept map.');
  }
});

applyConceptMapToggle();

// Reflect saved config into the settings controls.
if (cmModeSelect) cmModeSelect.value = conceptMapMode;
if (cmArrangement) cmArrangement.value = conceptMapArrangement;
if (cmIncludeEvents) cmIncludeEvents.checked = conceptMapIncludeEvents;
if (cmMaxConcepts) cmMaxConcepts.value = conceptMapMaxConcepts;
if (cmMaxChars) cmMaxChars.value = conceptMapMaxChars;
if (cmMinEvidence) cmMinEvidence.value = conceptMapMinEvidence;
if (cmFraming) cmFraming.value = conceptMapFraming;
if (cmExtractionGuidelines) cmExtractionGuidelines.value = conceptMapExtractionGuidelines;
if (cmCanonizationGuidelines) cmCanonizationGuidelines.value = conceptMapCanonizationGuidelines;
if (cmLevelsGroup) {
  const set = new Set(conceptMapLevels);
  for (const cb of cmLevelsGroup.querySelectorAll('input[data-level]')) {
    cb.checked = set.has(cb.dataset.level);
  }
}

cmModeSelect?.addEventListener('change', () => {
  conceptMapMode = CM_MODES.includes(cmModeSelect.value) ? cmModeSelect.value : 'overview';
  cmModeSelect.value = conceptMapMode;
  localStorage.setItem('conceptMapMode', conceptMapMode);
});

cmArrangement?.addEventListener('change', () => {
  conceptMapArrangement = ['hierarchy', 'salience', 'alpha'].includes(cmArrangement.value)
    ? cmArrangement.value : 'hierarchy';
  cmArrangement.value = conceptMapArrangement;
  localStorage.setItem('conceptMapArrangement', conceptMapArrangement);
});

cmIncludeEvents?.addEventListener('change', () => {
  conceptMapIncludeEvents = cmIncludeEvents.checked;
  localStorage.setItem('conceptMapIncludeEvents', conceptMapIncludeEvents ? '1' : '0');
});

cmMaxConcepts?.addEventListener('change', () => {
  const val = Math.min(9999, Math.max(10, parseInt(cmMaxConcepts.value) || 200));
  conceptMapMaxConcepts = val;
  cmMaxConcepts.value = val;
  localStorage.setItem('conceptMapMaxConcepts', val);
});

cmMaxChars?.addEventListener('change', () => {
  const val = Math.min(1000000, Math.max(2000, parseInt(cmMaxChars.value) || 200000));
  conceptMapMaxChars = val;
  cmMaxChars.value = val;
  localStorage.setItem('conceptMapMaxChars', val);
});

cmMinEvidence?.addEventListener('change', () => {
  const val = Math.min(40, Math.max(0, parseInt(cmMinEvidence.value) || 0));
  conceptMapMinEvidence = val;
  cmMinEvidence.value = val;
  localStorage.setItem('conceptMapMinEvidence', val);
});

cmFraming?.addEventListener('change', () => {
  conceptMapFraming = cmFraming.value.trim() || CM_DEFAULT_FRAMING;
  cmFraming.value = conceptMapFraming;
  localStorage.setItem('conceptMapFraming', conceptMapFraming);
});

cmFramingReset?.addEventListener('click', () => {
  conceptMapFraming = CM_DEFAULT_FRAMING;
  if (cmFraming) cmFraming.value = CM_DEFAULT_FRAMING;
  localStorage.setItem('conceptMapFraming', CM_DEFAULT_FRAMING);
});

cmExtractionGuidelines?.addEventListener('change', () => {
  conceptMapExtractionGuidelines = cmExtractionGuidelines.value.trim();
  cmExtractionGuidelines.value = conceptMapExtractionGuidelines;
  localStorage.setItem('conceptMapExtractionGuidelines', conceptMapExtractionGuidelines);
});

cmCanonizationGuidelines?.addEventListener('change', () => {
  conceptMapCanonizationGuidelines = cmCanonizationGuidelines.value.trim();
  cmCanonizationGuidelines.value = conceptMapCanonizationGuidelines;
  localStorage.setItem('conceptMapCanonizationGuidelines', conceptMapCanonizationGuidelines);
});

cmLevelsGroup?.addEventListener('change', () => {
  const levels = [];
  for (const cb of cmLevelsGroup.querySelectorAll('input[data-level]')) {
    if (cb.checked) levels.push(cb.dataset.level);
  }
  conceptMapLevels = levels;
  localStorage.setItem('conceptMapLevels', levels.join(','));
});

// ── Local library: composer toggle + settings ─────────────────────────────────────
function applyLibraryToggle() {
  if (!libraryToggle) return;
  libraryToggle.classList.toggle('active', libraryEnabled);
  libraryToggle.setAttribute('aria-pressed', libraryEnabled ? 'true' : 'false');
  libraryToggle.title = `Context source: ${CONTEXT_SOURCES.library} — ${libraryEnabled ? 'on' : 'off'}`;
}

libraryToggle?.addEventListener('click', () => {
  libraryEnabled = !libraryEnabled;
  localStorage.setItem('libraryEnabled', libraryEnabled ? '1' : '0');
  applyLibraryToggle();
  if (libraryEnabled && !libParseSources(librarySourcesText).length) {
    addMessage('error', 'Local library is on, but no sources are set. Add folders/files in Settings → Library.');
  }
});

applyLibraryToggle();

if (libSources) libSources.value = librarySourcesText;
if (libMode) libMode.value = libraryMode;
if (libMaxChars) libMaxChars.value = libraryMaxChars;
if (libSemantic) libSemantic.checked = librarySemantic;
if (libSearchUrl) libSearchUrl.value = librarySearchUrl;

libSources?.addEventListener('change', () => {
  librarySourcesText = libSources.value;
  saveMachinePath('librarySources', librarySourcesText);
});

libMode?.addEventListener('change', () => {
  libraryMode = libMode.value === 'all' ? 'all' : 'relevant';
  localStorage.setItem('libraryMode', libraryMode);
});

libMaxChars?.addEventListener('change', () => {
  const val = Math.min(200000, Math.max(1000, parseInt(libMaxChars.value) || 12000));
  libraryMaxChars = val;
  libMaxChars.value = val;
  localStorage.setItem('libraryMaxChars', val);
});

libSemantic?.addEventListener('change', () => {
  librarySemantic = !!libSemantic.checked;
  localStorage.setItem('librarySemantic', librarySemantic ? '1' : '0');
  libSearchOffUntilReload = false;   // turning it back on is a request to retry
});

libSearchUrl?.addEventListener('change', () => {
  librarySearchUrl = libSearchUrl.value.trim();
  localStorage.setItem('librarySearchUrl', librarySearchUrl);
  libSearchOffUntilReload = false;   // a new address deserves a fresh probe
});

libPreview?.addEventListener('click', async () => {
  const sources = libParseSources(libSources ? libSources.value : librarySourcesText);
  if (!sources.length) { if (libStatus) libStatus.textContent = 'Add at least one folder or file path first.'; return; }
  if (libStatus) libStatus.textContent = 'Reading sources…';
  try {
    const res = await window.api.libraryCollect(sources, LIBRARY_COLLECT_OPTS);
    const files = Array.isArray(res?.files) ? res.files : [];
    const zones = [...new Set(files.map(f => f.zone))];
    const kb = Math.round((res?.stats?.chars || 0) / 1000);
    const miss = (res?.stats?.missing || []);
    if (libStatus) libStatus.textContent = files.length
      ? `${files.length} files · ${zones.length} zone(s): ${zones.join(', ')} · ~${kb}k chars`
        + (miss.length ? ` · ${miss.length} missing path(s)` : '')
        + (res?.stats?.capped ? ' · capped' : '')
        + (files.length ? ` · ${await libSemanticCoverage(files)}` : '')
      : `No readable text files found${miss.length ? ` · missing: ${miss.join(', ')}` : ''}.`;
  } catch (err) {
    if (libStatus) libStatus.textContent = `Read failed: ${err?.message || err}`;
  }
});

// ── Browser history: composer toggle + settings ───────────────────────────────────
function applyHistoryToggle() {
  if (!historyToggle) return;
  historyToggle.classList.toggle('active', historyEnabled);
  historyToggle.setAttribute('aria-pressed', historyEnabled ? 'true' : 'false');
  historyToggle.title = `Context source: ${CONTEXT_SOURCES.history} — ${historyEnabled ? 'on' : 'off'}`;
}

historyToggle?.addEventListener('click', () => {
  historyEnabled = !historyEnabled;
  localStorage.setItem('historyEnabled', historyEnabled ? '1' : '0');
  applyHistoryToggle();
});

applyHistoryToggle();

if (histMode) histMode.value = historyMode;
if (histDays) histDays.value = historyDays;
if (histMaxEntries) histMaxEntries.value = historyMaxEntries;
if (histMaxChars) histMaxChars.value = historyMaxChars;
if (histIncludeChrome) histIncludeChrome.checked = historyIncludeChrome;
if (histProfiles) histProfiles.value = historyProfilesText;

histMode?.addEventListener('change', () => {
  historyMode = histMode.value === 'recent' ? 'recent' : 'relevant';
  localStorage.setItem('historyMode', historyMode);
});

histDays?.addEventListener('change', () => {
  const val = Math.min(3650, Math.max(1, parseInt(histDays.value) || 30));
  historyDays = val;
  histDays.value = val;
  localStorage.setItem('historyDays', val);
});

histMaxEntries?.addEventListener('change', () => {
  const val = Math.min(500, Math.max(1, parseInt(histMaxEntries.value) || 40));
  historyMaxEntries = val;
  histMaxEntries.value = val;
  localStorage.setItem('historyMaxEntries', val);
});

histMaxChars?.addEventListener('change', () => {
  const val = Math.min(200000, Math.max(1000, parseInt(histMaxChars.value) || 8000));
  historyMaxChars = val;
  histMaxChars.value = val;
  localStorage.setItem('historyMaxChars', val);
});

histIncludeChrome?.addEventListener('change', () => {
  historyIncludeChrome = !!histIncludeChrome.checked;
  localStorage.setItem('historyIncludeChrome', historyIncludeChrome ? '1' : '0');
});

histProfiles?.addEventListener('change', () => {
  historyProfilesText = histProfiles.value;
  saveMachinePath('historyProfiles', historyProfilesText);
});

histPreview?.addEventListener('click', async () => {
  if (histStatus) histStatus.textContent = 'Reading browser history…';
  try {
    const res = await window.api.historySearch({
      query: '',
      days: historyDays,
      scanLimit: HISTORY_SCAN_LIMIT,
      includeChrome: historyIncludeChrome,
      profilePaths: historyParsePaths(histProfiles ? histProfiles.value : historyProfilesText),
    });
    const items = Array.isArray(res?.items) ? res.items : [];
    const profiles = (res?.stats?.profiles || []).length;
    const errs = res?.stats?.missing || [];
    if (histStatus) histStatus.textContent = items.length
      ? `${items.length} recent entr${items.length === 1 ? 'y' : 'ies'} · ${profiles} profile(s) · window ${historyDays}d`
        + (errs.length ? ` · ${errs.length} issue(s): ${errs.join('; ')}` : '')
      : `No history found${errs.length ? ` · ${errs.join('; ')}` : ''}.`;
  } catch (err) {
    if (histStatus) histStatus.textContent = `Read failed: ${err?.message || err}`;
  }
});

// ── Hermes warm memory: composer toggle + settings ────────────────────────────────
function applyHermesToggle() {
  if (!hermesToggle) return;
  hermesToggle.classList.toggle('active', hermesEnabled);
  hermesToggle.setAttribute('aria-pressed', hermesEnabled ? 'true' : 'false');
  const extra = hermesTiers.length ? ` (+ ${hermesTiers.join(', ')})` : '';
  hermesToggle.title = `Context source: ${CONTEXT_SOURCES.hermes} — ${hermesEnabled ? `on${extra}` : 'off'}`;
}

hermesToggle?.addEventListener('click', () => {
  hermesEnabled = !hermesEnabled;
  localStorage.setItem('hermesEnabled', hermesEnabled ? '1' : '0');
  applyHermesToggle();
});

applyHermesToggle();

if (hermesRootInput) hermesRootInput.value = hermesRoot;
if (hermesMaxTopicsEl) hermesMaxTopicsEl.value = hermesMaxTopics;
if (hermesMaxCharsEl) hermesMaxCharsEl.value = hermesMaxChars;
if (hermesTiersGroup) {
  for (const cb of hermesTiersGroup.querySelectorAll('input[data-tier]')) {
    cb.checked = hermesTiers.includes(cb.dataset.tier);
  }
}

hermesRootInput?.addEventListener('change', () => {
  hermesRoot = hermesRootInput.value.trim().replace(/^"|"$/g, '');
  hermesRootInput.value = hermesRoot;
  saveMachinePath('hermesRoot', hermesRoot);
});

hermesTiersGroup?.addEventListener('change', () => {
  const tiers = [];
  for (const cb of hermesTiersGroup.querySelectorAll('input[data-tier]')) {
    if (cb.checked && HERMES_TIERS.includes(cb.dataset.tier) && cb.dataset.tier !== 'active') tiers.push(cb.dataset.tier);
  }
  hermesTiers = tiers;
  localStorage.setItem('hermesTiers', tiers.join(','));
  applyHermesToggle();  // the tooltip names the non-current tiers, so it changes with them
});

hermesMaxTopicsEl?.addEventListener('change', () => {
  const val = Math.min(30, Math.max(1, parseInt(hermesMaxTopicsEl.value) || 5));
  hermesMaxTopics = val;
  hermesMaxTopicsEl.value = val;
  localStorage.setItem('hermesMaxTopics', val);
});

hermesMaxCharsEl?.addEventListener('change', () => {
  const val = Math.min(200000, Math.max(1000, parseInt(hermesMaxCharsEl.value) || 9000));
  hermesMaxChars = val;
  hermesMaxCharsEl.value = val;
  localStorage.setItem('hermesMaxChars', val);
});

hermesPreview?.addEventListener('click', async () => {
  if (hermesStatus) hermesStatus.textContent = 'Reading workspace…';
  try {
    const res = await window.api.hermesCollect({
      root: hermesRootInput ? hermesRootInput.value.trim() : hermesRoot,
      tiers: hermesRequestTiers(),
      ...HERMES_COLLECT_OPTS,
    });
    const docs = (Array.isArray(res?.docs) ? res.docs : []).map(hermesReadDoc);
    const counts = res?.stats?.tiers || {};
    const issues = res?.stats?.missing || [];
    const due = docs.filter(d => d.fresh.state === 'review-due').length;
    const undated = docs.filter(d => d.fresh.state === 'undated').length;
    if (hermesStatus) {
      hermesStatus.textContent = docs.length
        ? `${res.root} · ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(' · ')}`
          + ` · index ${res.indexFound ? 'found' : 'missing'}`
          + (due ? ` · ${due} past review date` : '')
          + (undated ? ` · ${undated} undated (cannot be aged)` : '')
          + (issues.length ? ` · ${issues.join('; ')}` : '')
        : `No topic documents found in ${res?.root || 'the workspace'}${issues.length ? ` · ${issues.join('; ')}` : ''}.`;
    }
  } catch (err) {
    if (hermesStatus) hermesStatus.textContent = `Read failed: ${err?.message || err}`;
  }
});

cmMapSelect?.addEventListener('change', () => {
  conceptMapPath = cmMapSelect.value || '';
  saveMachinePath('conceptMapPath', conceptMapPath);
  conceptGraphCache = { path: null, graph: null };  // invalidate on map switch
  updateConceptMapStatus();
});

cmMapRefresh?.addEventListener('click', () => {
  conceptGraphCache = { path: null, graph: null };
  renderConceptMapSettings();
});

// Populate the picker from analysis output on disk.
async function renderConceptMapSettings() {
  if (!cmMapSelect) return;
  if (cmMapStatus) cmMapStatus.textContent = 'Scanning analysis output…';
  let graphs = [];
  try {
    const res = await window.api.analysisListGraphs();
    graphs = Array.isArray(res?.graphs) ? res.graphs : [];
  } catch (err) {
    if (cmMapStatus) cmMapStatus.textContent = `Could not list concept maps: ${err?.message || err}`;
    return;
  }

  cmMapSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = graphs.length
    ? '— newest map, chosen automatically —'
    : '— no concept maps found (run Data Analysis first) —';
  cmMapSelect.appendChild(placeholder);

  for (const g of graphs) {
    const opt = document.createElement('option');
    opt.value = g.path;
    const who = g.kind === 'reconciliation'
      ? 'reconciled'
      : [g.source, g.datasetId, g.runId].filter(Boolean).join('/');
    const name = g.graphId || g.fileName || 'graph';
    opt.textContent = `${name} · ${who} · ${g.conceptCount} concepts${g.eventCount ? ` · ${g.eventCount} ev` : ''}`;
    cmMapSelect.appendChild(opt);
  }

  // Keep a saved-but-missing selection usable (e.g. graph on disk not re-scanned yet).
  if (conceptMapPath && !graphs.some(g => g.path === conceptMapPath)) {
    const opt = document.createElement('option');
    opt.value = conceptMapPath;
    opt.textContent = `(saved) ${conceptMapPath.split(/[\\/]/).pop()}`;
    cmMapSelect.appendChild(opt);
  }
  cmMapSelect.value = conceptMapPath || '';
  updateConceptMapStatus(graphs);
}

function updateConceptMapStatus(graphs) {
  if (!cmMapStatus) return;
  // No explicit selection is a valid state: the newest graph on disk is used. Name it, so
  // "automatic" does not read as "nothing is happening".
  if (!conceptMapPath) {
    const list = Array.isArray(graphs) ? graphs : [];
    const auto = list.find(g => g.kind === 'reconciliation') || list[0];
    if (!auto) {
      cmMapStatus.textContent = 'No concept maps on disk yet — run Data Analysis to build one.';
    } else {
      const name = auto.graphId || auto.fileName || 'graph';
      const kind = auto.kind === 'reconciliation' ? 'newest reconciled map' : 'newest map';
      cmMapStatus.textContent = `Automatic: ${kind} on disk — ${name}, ${auto.conceptCount} concepts.`
        + ' Pick one above to pin it instead.';
    }
    return;
  }
  const g = Array.isArray(graphs) ? graphs.find(x => x.path === conceptMapPath) : null;
  if (g) {
    const macro = Array.isArray(g.macroLabels) && g.macroLabels.length
      ? ` — ${g.macroLabels.slice(0, 5).join(', ')}${g.macroLabels.length > 5 ? '…' : ''}`
      : '';
    cmMapStatus.textContent = `Selected: ${g.conceptCount} concepts${g.eventCount ? `, ${g.eventCount} events` : ''}${macro}`;
  } else {
    cmMapStatus.textContent = `Selected: ${conceptMapPath.split(/[\\/]/).pop()}`;
  }
}

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

const ANALYSIS_LOG_MAX_ROWS = 1000;
let analysisLogQueue = [];
let analysisLogFlushPending = false;

function flushAnalysisLogQueue() {
  analysisLogFlushPending = false;
  if (!analysisLog || analysisLogQueue.length === 0) return;
  const fragment = document.createDocumentFragment();
  for (const row of analysisLogQueue) fragment.appendChild(row);
  analysisLogQueue = [];
  analysisLog.appendChild(fragment);
  while (analysisLog.childElementCount > ANALYSIS_LOG_MAX_ROWS) {
    analysisLog.removeChild(analysisLog.firstChild);
  }
  analysisLog.scrollTop = analysisLog.scrollHeight;
}

function analysisLogLine(text, type = 'info') {
  const line = `[${new Date().toLocaleTimeString()}] ${text}`;
  if (analysisLog) {
    // Batched via rAF and capped at ANALYSIS_LOG_MAX_ROWS: a long run can call this
    // hundreds/thousands of times in quick succession, and appending+reflowing once
    // per call (rather than once per frame) made that scale with total log volume.
    const row = document.createElement('div');
    row.className = `analysis-log-row ${type}`;
    row.textContent = line;
    analysisLogQueue.push(row);
    // Capped independently of the rendered/flushed rows: rAF is suspended while a
    // WebView2 window is minimized/occluded, so without this the queue itself could
    // grow unbounded during a long automated run even though on-screen rows stay capped.
    if (analysisLogQueue.length > ANALYSIS_LOG_MAX_ROWS) {
      analysisLogQueue.splice(0, analysisLogQueue.length - ANALYSIS_LOG_MAX_ROWS);
    }
    if (!analysisLogFlushPending) {
      analysisLogFlushPending = true;
      requestAnimationFrame(flushAnalysisLogQueue);
    }
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
  // Drop anything queued but not yet flushed, so a rAF callback already scheduled by a
  // pre-clear analysisLogLine() call doesn't repopulate this freshly-cleared panel with
  // stale lines from the run being cleared.
  analysisLogQueue = [];
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
  const saved = pref('analysisProfile');
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
  const setButton = (btn, enabled, label, extra = '') => {
    if (!btn) return;
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = `${label} reasoning: ${enabled ? 'ask on' : 'explicit off'}${extra}`;
  };
  // The composer button carries what the sidebar's info panel says, since that panel is
  // only reachable in Analysis mode now.
  setButton(reasoningChatToggle, requestChatReasoning, 'Chat',
    `\n${modelLabel}: ${report.state}.\nOff sends no-thinking hints; some model templates think anyway.`);
  setButton(reasoningAnalysisToggle, requestAnalysisReasoning, 'Data analysis');
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
  if (source === 'openai') return 'OpenAI';
  if (source === 'grok') return 'Grok';
  return 'Anthropic';
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
      : source === 'grok'
      ? 'Paste Grok export prod-grok-backend.json path...'
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
    refreshAnalysisRunHealth();
  } finally {
    setAnalysisLoading(false);
  }
}

// Thresholds come from measured runs on real exports, not from taste: a clean pass on this
// machine sat at 0.1% repeated rows / 0% self-parents / 2% unknown ids, while a degenerate
// one on the same model and code hit 40.9% / 19.8% / 26.4%. "warn" is set well above the
// clean run's noise floor so a healthy pass never cries wolf.
const RUN_HEALTH_CHECKS = [
  {
    key: 'repeatedPct',
    label: 'repeated topic rows',
    warn: 5,
    bad: 20,
    why: 'the extractor emitted the same TOPIC block more than once in a single chunk',
  },
  {
    key: 'selfParentPct',
    label: 'self-parenting rows',
    warn: 5,
    bad: 15,
    why: 'rows naming themselves as their own parent, which flattens the hierarchy',
  },
  {
    key: 'unknownRecordPct',
    label: 'unknown record ids',
    warn: 10,
    bad: 20,
    why: 'cited evidence ids that do not exist in this dataset',
  },
];

function runHealthGrade(value, check) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= check.bad) return 'bad';
  if (value >= check.warn) return 'warn';
  return 'good';
}

function renderRunHealth(health, { pending = false, error = '', idle = '' } = {}) {
  if (!analysisRunHealthBox) return;
  analysisRunHealthBox.classList.remove('is-good', 'is-warn', 'is-bad', 'is-idle');
  analysisHealthMetrics.innerHTML = '';

  if (idle) {
    analysisRunHealthBox.classList.add('is-idle');
    analysisHealthVerdict.textContent = idle;
    analysisHealthNote.textContent = '';
    return;
  }
  if (pending) {
    analysisRunHealthBox.classList.add('is-idle');
    analysisHealthVerdict.textContent = 'checking…';
    analysisHealthNote.textContent = '';
    return;
  }
  if (error) {
    analysisRunHealthBox.classList.add('is-idle');
    analysisHealthVerdict.textContent = 'unavailable';
    analysisHealthNote.textContent = error;
    return;
  }
  if (!health || !health.hasResults) {
    analysisRunHealthBox.classList.add('is-idle');
    analysisHealthVerdict.textContent = 'no topic pass yet';
    analysisHealthNote.textContent = 'Run Process Topics, then this reports what the extractor actually produced.';
    return;
  }

  const grades = [];
  for (const check of RUN_HEALTH_CHECKS) {
    // Record-id validation needs the dataset's chunks; say so rather than showing a
    // reassuring 0% when the file is missing.
    const checked = check.key !== 'unknownRecordPct' || health.recordIdsChecked;
    const value = checked ? Number(health[check.key]) : NaN;
    const grade = checked ? runHealthGrade(value, check) : 'unknown';
    grades.push(grade);
    const el = document.createElement('span');
    el.className = `analysis-health-metric is-${grade}`;
    el.textContent = checked ? `${value.toFixed(1)}% ${check.label}` : `${check.label} not checked`;
    el.title = check.why;
    analysisHealthMetrics.appendChild(el);
  }

  const total = Number(health.totalChunks) || 0;
  const done = Number(health.processedChunks) || 0;
  const partial = total > 0 && done < total;
  const coverage = document.createElement('span');
  coverage.className = `analysis-health-metric is-${partial ? 'warn' : 'good'}`;
  coverage.textContent = `${done}/${total || '?'} chunks covered`;
  coverage.title = partial
    ? 'This run has not seen the whole dataset — a graph built from it is a sample, not the corpus.'
    : 'Every chunk in the dataset has a topic result.';
  analysisHealthMetrics.appendChild(coverage);
  if (partial) grades.push('warn');

  const worst = grades.includes('bad') ? 'bad' : grades.includes('warn') ? 'warn' : 'good';
  analysisRunHealthBox.classList.add(`is-${worst}`);
  analysisHealthVerdict.textContent = worst === 'bad'
    ? 'Degraded'
    : worst === 'warn' ? 'Check before use' : 'Healthy';

  if (worst === 'bad') {
    analysisHealthNote.textContent =
      'Canonization discards this noise, so the graph will be sound — but the topics the model failed to '
      + 'extract are simply absent, and only re-processing this dataset can recover them. Do not reconcile '
      + 'a degraded run into a clean graph: reconciliation unions, so the worse input wins on volume.';
  } else if (worst === 'warn') {
    analysisHealthNote.textContent = partial && grades.filter(g => g === 'warn').length === 1
      ? 'Partial coverage: fine for a test slice, misleading if you read the graph as your whole history.'
      : 'Slightly above a clean run. Usable, but compare against another run before building on it.';
  } else {
    analysisHealthNote.textContent = 'Extractor output looks clean for this run.';
  }
}

async function refreshAnalysisRunHealth() {
  if (!analysisRunHealthBox) return;
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    renderRunHealth(null, { idle: activeAnalysisDatasetId ? 'no run selected' : 'no dataset selected' });
    return;
  }
  const datasetId = activeAnalysisDatasetId;
  const runId = activeAnalysisRunId;
  renderRunHealth(null, { pending: true });
  try {
    const health = await window.api.analysisRunHealth(datasetId, runId);
    // The user can switch runs while a first, uncached scan of a large dataset is running.
    if (datasetId !== activeAnalysisDatasetId || runId !== activeAnalysisRunId) return;
    renderRunHealth(health);
  } catch (err) {
    if (datasetId !== activeAnalysisDatasetId || runId !== activeAnalysisRunId) return;
    renderRunHealth(null, { error: `Could not read run health: ${err?.message || err}` });
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
      cancelScope: 'analysis',
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

// Formats user-tunable extra guidelines (from Settings → Concept map) as an appended
// rules block. Returns '' when the user has not added any, so prompts keep their defaults.
function conceptGuidelineBlock(text) {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => (l.startsWith('-') ? l : `- ${l}`));
  return lines.length ? `\nAdditional user guidelines (follow these too):\n${lines.join('\n')}\n` : '';
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
${conceptGuidelineBlock(conceptMapExtractionGuidelines)}
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
${conceptGuidelineBlock(conceptMapExtractionGuidelines)}
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
${conceptGuidelineBlock(conceptMapCanonizationGuidelines)}
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
${conceptGuidelineBlock(conceptMapCanonizationGuidelines)}
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
  // Re-read health here specifically: this is the moment the extractor's output is final,
  // and it is the last point before canonization where re-processing is still the cheap fix.
  refreshAnalysisRunHealth();
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

// options.validRecordIds  Set of record ids the dataset actually contains. When given,
//                         cited ids outside it are dropped as extractor noise.
// options.conceptLimit    how many concepts survive the final ranking (default 900).
// options.evidenceChunks  how many evidence rows to store per concept (default 8). This
//                         only bounds the stored sample — `evidence_totals` stays exact.
// Results may carry `source_dataset`; when they do, each concept records which sources
// contributed to it. Callers combining several datasets MUST namespace `chunk_id` per
// dataset first: chunk ids are assigned per dataset (`chunk_000048` exists in all of
// them), so unprefixed ids from different providers collide and undercount evidence.
function deterministicGraphFromTopicResults(datasetId, runId, results, profile, options = {}) {
  const concepts = new Map();
  const parentEdges = new Map();
  const events = [];
  const chunkConceptIds = new Map();
  const validRecordIds = options.validRecordIds instanceof Set ? options.validRecordIds : null;
  const conceptLimit = Math.max(1, options.conceptLimit || 900);
  const evidenceChunks = Math.max(1, options.evidenceChunks || 8);
  const recordsPerChunk = Math.max(1, options.recordsPerChunk || 4);

  for (const result of results || []) {
    const chunkIdsForEvent = [];
    const sourceTag = sanitizeFastField(result.source_dataset || '', 60);
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
        _summary_chars: 0,
        _ev: new Map(),
        _sources: new Set()
      };
      if (sourceTag) existing._sources.add(sourceTag);
      existing._count += 1;
      existing.canonical_label = chooseCanonicalLabel(existing.canonical_label, label);
      existing.aliases = addUniqueLimited(existing.aliases, [label, ...(topic.aliases || [])], 8);
      const summary = sanitizeFastField(topic.summary || label, 260);
      if (summary && (!existing.summary || summary.length > existing._summary_chars)) {
        existing.summary = summary;
        existing._summary_chars = summary.length;
      }
      existing.subtopics = addUniqueLimited(existing.subtopics, topic.subtopics || [], 12);
      // A self-parent is not a hierarchy. The extractor echoes the label back as its own
      // parent on some datasets (19.8% of rows on the openai export); accepting it makes
      // a concept its own ancestor, and the self-edge is dropped downstream anyway, which
      // strands the concept at the root and flattens the whole tree.
      const parentId = topic.parent_label
        ? normalizeConceptId(conceptMergeKey(topic.parent_label))
        : '';
      if (parentId && parentId !== conceptId) {
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
            _summary_chars: 0,
            _ev: new Map(),
            // A parent synthesized from a child's parent_label is still evidenced by the
            // dataset that produced that child; without this it lands in the graph with
            // no provenance at all (7,092 of 23,811 concepts on the 3-provider build).
            _sources: new Set(sourceTag ? [sourceTag] : [])
          });
        } else {
          const parent = concepts.get(parentId);
          parent.subtopics = addUniqueLimited(parent.subtopics, [label], 12);
          if (sourceTag) parent._sources.add(sourceTag);
        }
      }
      // Evidence accumulates per chunk, not per TOPIC row. The extractor repeats whole
      // topic blocks verbatim on some datasets (40.9% of rows on the openai export) and
      // an unkeyed push counted every copy as fresh evidence. Deduping BEFORE the cap
      // matters more than it looks: the cap keeps the FIRST rows, so copies used to fill
      // the quota and lock a concept onto a single chunk no matter what came later.
      if (topic.evidence_record_ids?.length) {
        const bucket = existing._ev.get(result.chunk_id) || new Set();
        for (const rid of topic.evidence_record_ids) {
          if (bucket.size >= recordsPerChunk) break;
          const clean = sanitizeFastField(rid, 60);
          // An id the dataset has never contained is model noise, not evidence — 26.4%
          // of cited ids on the openai export, some of them prose fragments.
          if (clean && (!validRecordIds || validRecordIds.has(clean))) bucket.add(clean);
        }
        if (bucket.size) existing._ev.set(result.chunk_id, bucket);
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

  // Exact and uncapped totals; `evidence` is only a stored sample for traceability, so
  // anything ranking or filtering on weight must read the totals instead of counting rows.
  const materialize = (concept) => {
    const clean = { ...concept };
    const ev = concept._ev || new Map();
    let recordTotal = 0;
    for (const ids of ev.values()) recordTotal += ids.size;
    clean.evidence_totals = { chunks: ev.size, records: recordTotal };
    clean.evidence = [...ev.entries()]
      .slice(0, evidenceChunks)
      .map(([chunk_id, ids]) => ({ chunk_id, record_ids: [...ids] }));
    if (concept._sources && concept._sources.size) clean.sources = [...concept._sources].sort();
    clean.aliases = (clean.aliases || []).filter(alias => alias && alias !== clean.canonical_label).slice(0, 8);
    clean.summary = clean.summary || clean.canonical_label;
    delete clean._count;
    delete clean._summary_chars;
    delete clean._ev;
    delete clean._sources;
    return clean;
  };

  const conceptList = [...concepts.values()]
    .map(materialize)
    .sort((a, b) => {
      // Rank on true totals, not stored rows. Rows are capped, so ranking by them ties
      // every saturated concept at the ceiling and lets a narrow one that hit the cap
      // outrank a concept genuinely spread across far more of the history.
      const ac = a.evidence_totals.chunks + a.evidence_totals.records + (a.aliases || []).length;
      const bc = b.evidence_totals.chunks + b.evidence_totals.records + (b.aliases || []).length;
      return bc - ac || a.canonical_label.localeCompare(b.canonical_label);
    })
    .slice(0, conceptLimit);

  // Ranking is by evidence, but a parent synthesized from a child's parent_label carries
  // no evidence of its own and so always ranks last. Cutting on rank alone therefore
  // deletes the macro layer and strands every survivor at the root — the hierarchy
  // collapses precisely because the ranking worked. Pull the ancestors of kept concepts
  // back in; `conceptLimit` bounds the evidenced set, not the tree that explains it.
  const byId = new Map([...concepts.values()].map(c => [c.concept_id, c]));
  const kept = new Map(conceptList.map(c => [c.concept_id, c]));
  for (const concept of conceptList) {
    let parentId = concept.parent_id;
    // Bounded by depth, and guarded against a parent cycle the extractor could produce.
    for (let hops = 0; parentId && hops < 12; hops++) {
      if (kept.has(parentId)) break;
      const ancestor = byId.get(parentId);
      if (!ancestor) break;
      const added = materialize(ancestor);
      kept.set(parentId, added);
      conceptList.push(added);
      parentId = ancestor.parent_id;
    }
  }

  const conceptIds = new Set(conceptList.map(c => c.concept_id));
  // Scaled to the concept count: a flat 1000 silently truncated the tree as soon as the
  // graph grew past the old fixed 900-concept ceiling.
  const edges = [...parentEdges.values()]
    .filter(edge => conceptIds.has(edge.source) && conceptIds.has(edge.target))
    .slice(0, Math.max(1000, conceptList.length * 2));

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

// ── Reconcile two canonized graphs into one larger canonical vector map ──────────
const RECONCILE_LEVEL_RANK = { macro: 0, topic: 1, subtopic: 2, motif: 3 };
let lastReconciledPath = localStorage.getItem('analysisLastReconciledPath') || '';

function reconcilePathStem(path) {
  const clean = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const base = clean.split('/').pop() || 'graph';
  return base.replace(/\.json$/i, '') || 'graph';
}

function reconcileSetLabel(graph, path, fallback) {
  const ds = graph && typeof graph.dataset === 'object' && graph.dataset ? graph.dataset : null;
  if (ds && (ds.id || ds.run_id)) {
    return [ds.id, ds.run_id].filter(Boolean).join(' / ') || fallback;
  }
  if (graph?.graph_id) return String(graph.graph_id);
  return reconcilePathStem(path) || fallback;
}

function conceptMatchTokens(concept) {
  const tokens = new Set();
  const add = (value) => {
    const key = conceptMergeKey(value);
    if (key) tokens.add(key);
  };
  add(concept.canonical_label || concept.concept_id);
  for (const alias of concept.aliases || []) add(alias);
  return tokens;
}

function reconcileConceptDigest(concepts, max) {
  return (concepts || [])
    .slice(0, max)
    .map(c => ({
      id: String(c.concept_id || ''),
      label: truncateForPrompt(c.canonical_label || c.concept_id, 80),
      aliases: compactStringArray(c.aliases, 4, 60),
    }))
    .filter(c => c.id && c.label);
}

function buildSynonymMatchPrompt(labelA, labelB, listA, listB) {
  return `Two concept graphs were extracted from different data sources. Identify pairs of concepts — one from Set A and one from Set B — that refer to the SAME underlying concept, even when the wording differs (synonyms, abbreviations, rephrasings).

Rules:
- Only pair concepts that are genuinely the same thing.
- Do NOT pair concepts that are merely related, sibling, or parent/child.
- Each Set A concept pairs with at most one Set B concept, and vice versa.
- Use the exact concept_id strings provided.

Return ONLY minified JSON, no markdown:
{"pairs":[{"a":"<Set A concept_id>","b":"<Set B concept_id>"}]}

Set A (${labelA}):
${JSON.stringify(listA)}

Set B (${labelB}):
${JSON.stringify(listB)}`;
}

async function llmMatchCrossSetSynonyms(graphA, graphB, labelA, labelB) {
  const budget = 26000;
  let listA = reconcileConceptDigest(graphA.concepts, 400);
  let listB = reconcileConceptDigest(graphB.concepts, 400);
  const size = () => JSON.stringify(listA).length + JSON.stringify(listB).length;
  while (size() > budget && (listA.length > 40 || listB.length > 40)) {
    if (listA.length >= listB.length) listA = listA.slice(0, Math.max(40, Math.floor(listA.length * 0.8)));
    else listB = listB.slice(0, Math.max(40, Math.floor(listB.length * 0.8)));
  }
  if (listA.length < graphA.concepts.length || listB.length < graphB.concepts.length) {
    analysisLogLine(`Synonym matching limited to the first ${listA.length}/${graphA.concepts.length} (A) and ${listB.length}/${graphB.concepts.length} (B) concepts to fit the prompt budget. The deterministic union still covers every concept.`, 'warn');
  }
  const raw = await runAnalysisModel([
    { role: 'system', content: 'You match equivalent concepts across two concept graphs. You return valid JSON only.' },
    { role: 'user', content: buildSynonymMatchPrompt(labelA, labelB, listA, listB) }
  ], 0.1, { maxTokens: 4096, responseFormatJson: true });
  let parsed;
  try {
    parsed = await parseAnalysisJsonWithRepair(raw, 'synonym-match', '{"pairs":[{"a":"A concept_id","b":"B concept_id"}]}');
  } catch (err) {
    if (err?.message === 'cancelled') throw err;
    return [];
  }
  const aIds = new Set(listA.map(c => c.id));
  const bIds = new Set(listB.map(c => c.id));
  const out = [];
  const seen = new Set();
  for (const pair of (Array.isArray(parsed?.pairs) ? parsed.pairs : [])) {
    const a = String(pair?.a || '').trim();
    const b = String(pair?.b || '').trim();
    if (!aIds.has(a) || !bIds.has(b) || seen.has(`${a}|${b}`)) continue;
    seen.add(`${a}|${b}`);
    out.push([`A:${a}`, `B:${b}`]);
  }
  return out;
}

function reconcileGraphs(graphA, graphB, options = {}) {
  const inputs = [
    { tag: 'A', label: options.labelA || 'A', graph: normalizeGraph(graphA, 'graph_a') },
    { tag: 'B', label: options.labelB || 'B', graph: normalizeGraph(graphB, 'graph_b') },
  ];

  // Flatten concepts, keeping which set and original id each came from.
  const nodes = [];
  for (const input of inputs) {
    for (const concept of input.graph.concepts || []) {
      if (!concept || typeof concept !== 'object') continue;
      const origId = String(concept.concept_id || normalizeConceptId(concept.canonical_label || 'concept'));
      nodes.push({ set: input.tag, origId, concept });
    }
  }

  // Union-find: group concepts that are the same across both sets.
  const parent = nodes.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  // Merge on shared canonical/alias token (exact + alias-overlap duplicates).
  const tokenOwner = new Map();
  nodes.forEach((node, i) => {
    for (const token of conceptMatchTokens(node.concept)) {
      if (tokenOwner.has(token)) union(i, tokenOwner.get(token));
      else tokenOwner.set(token, i);
    }
  });

  // Apply optional model-found synonym links.
  const indexByKey = new Map(nodes.map((node, i) => [`${node.set}:${node.origId}`, i]));
  let forcedApplied = 0;
  for (const pair of options.forcedPairs || []) {
    const ia = indexByKey.get(pair[0]);
    const ib = indexByKey.get(pair[1]);
    if (ia != null && ib != null && find(ia) !== find(ib)) { union(ia, ib); forcedApplied += 1; }
  }

  const components = new Map();
  nodes.forEach((node, i) => {
    const root = find(i);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(node);
  });

  const usedIds = new Set();
  const idMap = new Map(); // `${set}:${origId}` -> merged concept_id
  const merged = [];
  let matchedCount = 0;
  const onlyCount = { A: 0, B: 0 };

  for (const group of components.values()) {
    const ranked = [...group].sort((a, b) => {
      const score = (n) => (n.concept.evidence?.length || 0) * 2 + (n.concept.aliases?.length || 0) + (n.concept.subtopics?.length || 0);
      return score(b) - score(a);
    });
    let mergedId = normalizeConceptId(ranked[0].concept.concept_id || ranked[0].concept.canonical_label || 'concept');
    if (usedIds.has(mergedId)) {
      mergedId = `${mergedId}_${hashString(group.map(n => `${n.set}:${n.origId}`).join('|')).slice(0, 6)}`;
    }
    usedIds.add(mergedId);

    const sources = new Set();
    let canonicalLabel = '';
    let bestLevel = '';
    let parentRef = null;
    let summary = '';
    let aliases = [];
    let subtopics = [];
    const evidenceByChunk = new Map();

    for (const node of ranked) {
      sources.add(node.set);
      idMap.set(`${node.set}:${node.origId}`, mergedId);
      const c = node.concept;
      canonicalLabel = chooseCanonicalLabel(canonicalLabel, sanitizeFastField(c.canonical_label || c.concept_id, 140));
      const lvl = sanitizeFastField(c.level, 24);
      if (lvl && (!bestLevel || (RECONCILE_LEVEL_RANK[lvl] ?? 9) < (RECONCILE_LEVEL_RANK[bestLevel] ?? 9))) bestLevel = lvl;
      if (!parentRef && c.parent_id) parentRef = { set: node.set, id: String(c.parent_id) };
      const s = sanitizeFastField(c.summary, 320);
      if (s && s.length > summary.length) summary = s;
      aliases = addUniqueLimited(aliases, [sanitizeFastField(c.canonical_label, 140), ...(c.aliases || [])], 16);
      subtopics = addUniqueLimited(subtopics, c.subtopics || [], 18);
      // Keyed by set+chunk, like aliases and subtopics are keyed by value. This was the
      // one field merged with a bare push, so every near-duplicate node in a merge group
      // donated another copy of the same row and evidence weight multiplied per merge.
      // Set-qualified because chunk ids are per-dataset and collide across sets.
      for (const ev of c.evidence || []) {
        if (!ev || typeof ev !== 'object') continue;
        const key = `${node.set}:${ev.chunk_id}`;
        const bucket = evidenceByChunk.get(key) || { set: node.set, chunk_id: ev.chunk_id, ids: new Set() };
        if (Array.isArray(ev.record_ids)) {
          for (const rid of ev.record_ids) {
            if (bucket.ids.size >= 6) break;
            bucket.ids.add(rid);
          }
        }
        evidenceByChunk.set(key, bucket);
      }
    }

    const sourceList = ['A', 'B'].filter(t => sources.has(t));
    if (sourceList.length > 1) matchedCount += 1;
    else onlyCount[sourceList[0]] += 1;

    merged.push({
      parentRef,
      concept: {
        concept_id: mergedId,
        canonical_label: canonicalLabel || mergedId,
        level: bestLevel || 'topic',
        parent_id: '',
        aliases: aliases.filter(a => a && a.toLowerCase() !== (canonicalLabel || '').toLowerCase()).slice(0, 14),
        summary: summary || canonicalLabel || mergedId,
        subtopics: subtopics.slice(0, 16),
        evidence: [...evidenceByChunk.values()]
          .slice(0, 12)
          .map(e => ({ set: e.set, chunk_id: e.chunk_id, record_ids: [...e.ids] })),
        // Counted off the deduped map. These are a lower bound: the inputs store only a
        // capped sample of their own evidence, so a reconciled total can never exceed
        // what its inputs kept. Canonizing the datasets together in one pass gives exact
        // totals; reconciling two finished graphs cannot.
        evidence_totals: {
          chunks: evidenceByChunk.size,
          records: [...evidenceByChunk.values()].reduce((n, e) => n + e.ids.size, 0),
        },
        sources: sourceList,
      },
    });
  }

  // Resolve parent ids now that every concept has a merged id.
  for (const entry of merged) {
    const ref = entry.parentRef;
    if (!ref || !ref.id) continue;
    const resolved = idMap.get(`${ref.set}:${ref.id}`);
    if (resolved && resolved !== entry.concept.concept_id) entry.concept.parent_id = resolved;
  }

  const concepts = merged
    .map(m => m.concept)
    .sort((a, b) => {
      const span = (b.sources?.length || 0) - (a.sources?.length || 0);
      if (span) return span;
      const ac = (a.evidence?.length || 0) + (a.aliases?.length || 0);
      const bc = (b.evidence?.length || 0) + (b.aliases?.length || 0);
      return bc - ac || a.canonical_label.localeCompare(b.canonical_label);
    })
    .slice(0, 2000);
  const keptIds = new Set(concepts.map(c => c.concept_id));

  // Union events, remapping concept references per source set.
  const events = [];
  const seenEvents = new Set();
  for (const input of inputs) {
    for (const event of input.graph.events || []) {
      if (!event || typeof event !== 'object') continue;
      const summary = sanitizeFastField(event.summary, 320);
      if (!summary) continue;
      const timestamp = sanitizeFastField(event.timestamp, 60);
      const dedupeKey = `${timestamp}|${conceptMergeKey(summary)}`;
      if (seenEvents.has(dedupeKey)) continue;
      seenEvents.add(dedupeKey);
      const conceptIds = (event.concept_ids || [])
        .map(id => idMap.get(`${input.tag}:${String(id)}`))
        .filter(id => id && keptIds.has(id));
      events.push({
        event_id: normalizeConceptId(`${input.tag}_${event.event_id || dedupeKey}`),
        timestamp,
        concept_ids: [...new Set(conceptIds)].slice(0, 8),
        summary,
        sources: [input.tag],
      });
      if (events.length >= 1200) break;
    }
  }

  // Union edges, remapping endpoints and keeping the strongest weight per relation.
  const edgeByKey = new Map();
  for (const input of inputs) {
    for (const edge of input.graph.edges || []) {
      if (!edge || typeof edge !== 'object') continue;
      const source = idMap.get(`${input.tag}:${String(edge.source)}`);
      const target = idMap.get(`${input.tag}:${String(edge.target)}`);
      if (!source || !target || source === target || !keptIds.has(source) || !keptIds.has(target)) continue;
      const relationship = sanitizeFastField(edge.relationship, 40) || 'related';
      const key = `${source}->${target}:${relationship}`;
      const weight = typeof edge.weight === 'number' ? edge.weight : undefined;
      const existing = edgeByKey.get(key);
      if (existing) {
        if (weight != null && (existing.weight == null || weight > existing.weight)) existing.weight = weight;
        if (!existing.sources.includes(input.tag)) existing.sources.push(input.tag);
      } else {
        edgeByKey.set(key, { source, target, relationship, weight, sources: [input.tag] });
      }
    }
  }
  const edges = [...edgeByKey.values()].slice(0, 1600);

  const sourceConceptTotal = nodes.length;
  const reconciledAt = new Date().toISOString();
  const graphId = `reconciled_${hashString(`${options.labelA}:${options.labelB}:${sourceConceptTotal}:${reconciledAt}`).slice(0, 8)}`;
  const inputMeta = inputs.map((input, i) => ({
    set: input.tag,
    label: input.label,
    graph_id: input.graph.graph_id || '',
    dataset: input.graph.dataset || null,
    path: (options.inputPaths || [])[i] || '',
    concept_count: (input.graph.concepts || []).length,
    event_count: (input.graph.events || []).length,
    edge_count: (input.graph.edges || []).length,
  }));

  return {
    schema_version: '0.1.0',
    graph_id: graphId,
    dataset: { id: 'reconciled', run_id: graphId },
    datasets: inputs.map(input => input.graph.dataset || null),
    concepts,
    events,
    edges,
    generated_at: reconciledAt,
    canonization_mode: `reconcile_${options.mode || 'deterministic'}`,
    reconciliation: {
      reconciled_at: reconciledAt,
      mode: options.mode || 'deterministic',
      model: options.model || '',
      inputs: inputMeta,
      source_concept_total: sourceConceptTotal,
      matched_concepts: matchedCount,
      only_in_a: onlyCount.A,
      only_in_b: onlyCount.B,
      forced_pairs_applied: forcedApplied,
      duration_ms: 0,
    },
    metrics: {
      stage: 'reconciled_graph',
      concept_count: concepts.length,
      event_count: events.length,
      edge_count: edges.length,
      matched_concepts: matchedCount,
      only_in_a: onlyCount.A,
      only_in_b: onlyCount.B,
      source_concept_total: sourceConceptTotal,
      model: options.model || '',
      generated_at: reconciledAt,
    },
  };
}

async function reconcileAnalysisGraphs() {
  const pathA = (analysisReconcilePathA?.value || '').trim();
  const pathB = (analysisReconcilePathB?.value || '').trim();
  if (!pathA || !pathB) {
    analysisLogLine('Provide two graph JSON paths to reconcile.', 'error');
    return;
  }
  if (pathA === pathB) {
    analysisLogLine('Choose two different graphs to reconcile.', 'warn');
    return;
  }
  const useLlm = !!analysisReconcileLlm?.checked;
  if (useLlm && !currentModel) {
    analysisLogLine('Select a model first, or turn off cross-set synonym matching.', 'error');
    return;
  }
  analysisStopRequested = false;
  const startedAt = performance.now();
  clearAnalysisView(activeAnalysisLogKind || '');
  setAnalysisStatus('Reconciling', 5);
  if (analysisProgressText) analysisProgressText.textContent = 'Loading graphs to reconcile...';
  analysisLogLine(`Reconciling graphs:\n  A: ${pathA}\n  B: ${pathB}`);

  let graphA;
  let graphB;
  try {
    graphA = await window.api.analysisReadGraph(pathA);
    graphB = await window.api.analysisReadGraph(pathB);
  } catch (err) {
    analysisLogLine(`Failed to read graph: ${err?.message || err}`, 'error');
    setAnalysisStatus('Reconcile failed', 100);
    return;
  }
  if (!Array.isArray(graphA?.concepts) || !Array.isArray(graphB?.concepts)) {
    analysisLogLine('Both files must be canonized graphs with a "concepts" array. Run "Canonize + Export" first.', 'error');
    setAnalysisStatus('Reconcile failed', 100);
    return;
  }
  const labelA = reconcileSetLabel(graphA, pathA, 'A');
  const labelB = reconcileSetLabel(graphB, pathB, 'B');
  analysisLogLine(`Set A "${labelA}": ${graphA.concepts.length} concepts, ${(graphA.events || []).length} events, ${(graphA.edges || []).length} edges.`);
  analysisLogLine(`Set B "${labelB}": ${graphB.concepts.length} concepts, ${(graphB.events || []).length} events, ${(graphB.edges || []).length} edges.`);

  let forcedPairs = [];
  if (useLlm) {
    setAnalysisStatus('Matching synonyms', 35);
    if (analysisProgressText) analysisProgressText.textContent = 'Matching cross-set synonyms with the model...';
    try {
      forcedPairs = await llmMatchCrossSetSynonyms(graphA, graphB, labelA, labelB);
      analysisLogLine(`Model matched ${forcedPairs.length} cross-set synonym pair(s).`);
    } catch (err) {
      if ((err?.message || String(err)) === 'cancelled') {
        markAnalysisStopped('Stopped during synonym matching.');
        return;
      }
      analysisLogLine(`Cross-set synonym matching failed; continuing with deterministic union only. ${err?.message || err}`, 'warn');
    }
  }

  setAnalysisStatus('Merging', 70);
  if (analysisProgressText) analysisProgressText.textContent = 'Building unified canonical vector map...';
  const graph = reconcileGraphs(graphA, graphB, {
    labelA,
    labelB,
    forcedPairs,
    mode: useLlm ? 'llm_assisted' : 'deterministic',
    model: useLlm ? (currentModel || '') : '',
    inputPaths: [pathA, pathB],
  });
  const durationMs = performance.now() - startedAt;
  graph.reconciliation.duration_ms = Math.round(durationMs);
  graph.metrics.total_elapsed_ms = Math.round(durationMs);

  const name = `reconciled_${reconcilePathStem(pathA)}_${reconcilePathStem(pathB)}`.slice(0, 80);
  const saved = await window.api.analysisSaveReconciliation(name, graph).catch((err) => {
    analysisLogLine(`Failed to save reconciled graph: ${err?.message || err}`, 'error');
    return null;
  });
  if (!saved) {
    setAnalysisStatus('Reconcile failed', 100);
    return;
  }
  lastReconciledPath = saved.path;
  localStorage.setItem('analysisLastReconciledPath', saved.path);
  if (analysisReconcileOutput) analysisReconcileOutput.textContent = `Reconciled graph: ${saved.path}`;
  if (analysisOutputPath) analysisOutputPath.textContent = `Output: ${saved.path}`;
  const r = graph.reconciliation;
  analysisLogLine(`Saved reconciled graph: ${saved.path}`);
  analysisLogLine(`Union: ${graph.concepts.length} concepts (${r.matched_concepts} merged across both sets, ${r.only_in_a} only in A, ${r.only_in_b} only in B), ${graph.events.length} events, ${graph.edges.length} edges. Finished in ${formatDuration(durationMs)}.`);
  analysisResultLine('Reconciliation complete', [
    `${graph.concepts.length} concepts`,
    `${r.matched_concepts} cross-set merges`,
    `${graph.events.length} events`,
    `${graph.edges.length} edges`,
    formatDuration(durationMs),
  ]);
  setAnalysisStatus('Reconciled', 100);
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
  refreshAnalysisRunHealth();
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
// Reconcile graphs panel: restore persisted state.
if (analysisReconcilePathA) analysisReconcilePathA.value = localStorage.getItem('analysisReconcilePathA') || '';
if (analysisReconcilePathB) analysisReconcilePathB.value = localStorage.getItem('analysisReconcilePathB') || '';
if (analysisReconcileLlm) analysisReconcileLlm.checked = localStorage.getItem('analysisReconcileLlm') === '1';
if (analysisReconcileOutput && lastReconciledPath) analysisReconcileOutput.textContent = `Reconciled graph: ${lastReconciledPath}`;

analysisReconcilePathA?.addEventListener('input', () => localStorage.setItem('analysisReconcilePathA', analysisReconcilePathA.value || ''));
analysisReconcilePathB?.addEventListener('input', () => localStorage.setItem('analysisReconcilePathB', analysisReconcilePathB.value || ''));
analysisReconcileLlm?.addEventListener('change', () => localStorage.setItem('analysisReconcileLlm', analysisReconcileLlm.checked ? '1' : '0'));

async function fillReconcilePathFromCurrentRun(input) {
  if (!input) return;
  if (!activeAnalysisDatasetId || !activeAnalysisRunId) {
    return analysisLogLine('Select a dataset and run first, or paste a graph path manually.', 'warn');
  }
  const paths = activeAnalysisPaths || await refreshAnalysisPaths();
  if (!paths?.outputGraph) return analysisLogLine('No output graph path for the active run yet. Canonize a run first.', 'warn');
  input.value = paths.outputGraph;
  localStorage.setItem(input === analysisReconcilePathA ? 'analysisReconcilePathA' : 'analysisReconcilePathB', input.value);
}

analysisReconcileUseA?.addEventListener('click', () => fillReconcilePathFromCurrentRun(analysisReconcilePathA));
analysisReconcileUseB?.addEventListener('click', () => fillReconcilePathFromCurrentRun(analysisReconcilePathB));
analysisReconcileRunBtn?.addEventListener('click', () => withAnalysisBusy(reconcileAnalysisGraphs));
analysisReconcileOpenBtn?.addEventListener('click', () => {
  if (!lastReconciledPath) return analysisLogLine('Reconcile two graphs first.', 'warn');
  window.api.analysisOpenPath(lastReconciledPath).catch((err) => analysisLogLine(`Open reconciled failed: ${err?.message || err}`, 'error'));
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
  // Scoped to 'analysis' so stopping a run does not also cancel a chat the user has
  // streaming in the other app-mode tab.
  window.api.cancelMessage('analysis').catch(() => {});
});

settingsServerConnect.addEventListener('click', () => {
  const url = settingsServerUrl.value.trim();
  if (!url) return;
  serverUrl = url;
  localStorage.setItem('serverUrl', serverUrl);
  window.api.setServerUrl(serverUrl).catch(() => {});
  // Persist the token too so "enter token + Connect" applies both before reconnecting.
  if (settingsApiToken) window.api.setApiToken(settingsApiToken.value.trim()).catch(() => {});
  loadModels(true);
});

// Saving the token alone (e.g. after LM Studio starts requiring one) reconnects.
settingsApiToken?.addEventListener('change', () => {
  window.api.setApiToken(settingsApiToken.value.trim())
    .then(() => loadModels(true))
    .catch(() => {});
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
    return JSON.parse(pref('modelVisionOverrides') || '{}') || {};
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

// Calibrated against real usage from LM Studio rather than guessed: a 96,320-char concept
// map plus preamble came back as 21,806 prompt tokens on gemma-4-26b-a4b, i.e. ~4.47
// chars/token. The old 3.5 overstated by ~26%. Still an estimate — tokenisers differ per
// model — but wrong by a few percent instead of a quarter.
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4.4);
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
  const chatTokens = estimateConversationTokens();
  const tokens = chatTokens + lastContextSourceTokens;
  const vision = inferVisionCapability(currentModel);
  const visionLabel = vision.trusted ? 'vision model' : '';
  const modelLabel = currentModel
    ? (currentModel.split('/').pop() || currentModel).slice(0, 40)
    : '—';
  const parts = [`◈ ${modelLabel}`];
  if (visionLabel) parts.push(visionLabel);
  // Broken out rather than folded in silently: a jump from 2k to 46k is the layers, and
  // seeing which half is which is what tells you to trim a layer instead of the chat.
  const layerNote = lastContextSourceTokens > 0
    ? `  ·  ${chatTokens.toLocaleString()} chat + ${lastContextSourceTokens.toLocaleString()} context sources`
    : '';

  if (ctx <= 0) {
    contextBarLabel.textContent = `${parts.join('  ·  ')}  ·  ~${tokens.toLocaleString()} tokens${layerNote}`;
    contextBarFill.style.width = '0%';
    contextBarFill.classList.remove('warn');
    return;
  }

  const pct = Math.min(100, Math.round((tokens / ctx) * 100));
  const warn = pct >= 75;
  contextBarFill.style.width = pct + '%';
  contextBarFill.classList.toggle('warn', warn);
  contextBarLabel.textContent =
    `${parts.join('  ·  ')}  ·  ~${tokens.toLocaleString()} / ${ctx.toLocaleString()} tokens  ·  ${pct}%${layerNote}`;
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
  if (name === 'conceptmap') renderConceptMapSettings();
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
  // Already loaded — don't send another load request for it.
  if (modelId === loadedModel) {
    setModelSelectTitles(`Loaded ${modelId}`);
    return;
  }
  const requestId = ++modelLoadRequestId;
  setModelSelectTitles(`Loading ${modelId} in LM Studio...`);
  try {
    const result = await window.api.loadModel(modelId);
    if (requestId !== modelLoadRequestId) return;
    if (result?.cancelled) {
      return;
    } else if (result?.ok) {
      loadedModel = modelId;
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

let sidebarVisible = prefBool('sidebarVisible');
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

  // Save branch. Same silent-failure class as saveCurrentChat: this call bypasses that
  // helper (it saves a brand-new forked chat, not the current one), so it needs its own
  // guard rather than relying on saveCurrentChat's try/catch to cover it.
  let result;
  try {
    result = await window.api.saveChat(branchChat, 0);
  } catch (err) {
    console.error('Failed to save branch chat:', err);
    addMessage('error', `Failed to save edited message: ${err?.message || err}`);
    return;
  }
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
  // Every call site previously awaited this without a catch, so a save failure (disk
  // error, IPC error) became an unhandled rejection: the message was already rendered
  // and the input already cleared, but nothing told the user it wasn't persisted.
  try {
    const result = await window.api.saveChat(currentChat, lastSavedCount);
    if (result?.newId) currentChat.id = result.newId;
    lastSavedCount = result?.savedCount || conversationHistory.length;
  } catch (err) {
    console.error('Failed to save chat:', err);
    addMessage('error', `Failed to save chat: ${err?.message || err}. Your latest message may not be saved to disk.`);
  }
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
  // Priming is per-chat and is not stored in the transcript, so a reopened chat re-primes
  // from the map as it stands now. That map may differ from the one this conversation was
  // originally primed with; re-priming is the honest option, since silently continuing on a
  // map the current settings no longer produce would be worse than a one-off cache miss.
  primedConceptMap = null;
  primedConceptMapSig = '';
  cmToolReasoningNoticed = false;

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

  // Reflect the chat's saved model in the UI, but do NOT preload it on chat switch:
  // merely opening chats (or returning to one) must not fire load requests or pile up
  // multiple models in LM Studio. The model loads when the user actually sends (LM Studio
  // JIT-loads it) or explicitly reselects it.
  if (chat.model && MODELS[chat.model]) {
    applySelectedModel(chat.model, false, { preload: false });
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
  primedConceptMap = null;
  primedConceptMapSig = '';
  cmToolReasoningNoticed = false;
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
    // 'chat' scope: image analysis runs as part of a send, so the composer's Stop should
    // reach it.
    { model, temperature: 0.2, maxTokens: IMAGE_ANALYSIS_MAX_TOKENS, cancelScope: 'chat' },
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

// Compact transcript of the turns BEFORE the latest user message, so the query
// planner can resolve references ("it", "that library we discussed") from context.
function recentTranscriptForPlanner(maxTurns = 6, maxCharsPerTurn = 400) {
  const prior = conversationHistory.slice(0, -1).slice(-maxTurns);
  const lines = [];
  for (const m of prior) {
    const who = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : m.role;
    let t = getDisplayText(m).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length > maxCharsPerTurn) t = t.slice(0, maxCharsPerTurn) + '…';
    lines.push(`${who}: ${t}`);
  }
  return lines.join('\n');
}

// One-shot, non-streaming model call used for query planning. Kept separate from the
// analysis model helpers so it doesn't touch the analysis log or reasoning toggles.
async function runQueryPlanner(messages) {
  let text = '';
  const result = await window.api.sendMessage(
    messages,
    { model: currentModel, temperature: 0.2, maxTokens: 400, reasoningRequested: false, cancelScope: 'chat' },
    (chunk) => { text += chunk; }
  );
  if (result?.error) throw new Error(result.error);
  if (result?.cancelled) throw new Error('cancelled');
  return (text || result?.content || '').trim();
}

// Turn the raw user message + recent context into focused search queries.
// Quick → exactly one query; Deep → up to WEB_DEEP_MAX_QUERIES, one per facet.
// Always resolves to at least one query; on any failure it falls back to the raw
// message, so the feature can never do worse than the old "send the prompt verbatim".
async function generateSearchQueries(userText, mode) {
  const fallback = [userText.trim()].filter(Boolean);
  if (!currentModel) return fallback;

  const deep = mode === 'deep';
  const countRule = deep
    ? `- If the message has multiple distinct sub-questions or facets, produce one focused query PER facet (up to ${WEB_DEEP_MAX_QUERIES}). If it is simple, produce just one. Never produce near-duplicate queries.`
    : `- Produce EXACTLY ONE query — the single best one to answer the message.`;

  const system = `You are a web-search query planner for a chat assistant. The assistant will answer the user's latest message; your job is to decide what to search for. Do NOT answer the question.

Rules:
- Resolve references: replace pronouns and vague mentions ("it", "that library", "the framework we discussed") with the explicit names/terms from the conversation.
- Strip conversational filler ("hey can you", "please", "I was wondering"). Keep only the searchable core.
- Prefer concise, keyword-style queries a search engine handles well. Include specifics (product names, versions, dates, exact error text) when implied.
${countRule}
- Respond with ONLY this JSON, nothing else: {"queries": ["..."]}`;

  const transcript = recentTranscriptForPlanner();
  const user = `${transcript ? `Recent conversation:\n${transcript}\n\n` : ''}Latest user message:\n${userText.trim()}\n\nProduce the search ${deep ? 'queries' : 'query'} as JSON.`;

  try {
    const raw = await runQueryPlanner([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const parsed = extractJsonObject(raw);
    let queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    queries = queries
      .map(q => (typeof q === 'string' ? q.trim() : ''))
      .filter(Boolean);
    // Dedupe case-insensitively, preserving order.
    const seen = new Set();
    queries = queries.filter(q => {
      const k = q.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!queries.length) return fallback;
    return deep ? queries.slice(0, WEB_DEEP_MAX_QUERIES) : [queries[0]];
  } catch (_) {
    return fallback;  // planner failed → behave like the old raw-query path
  }
}

function normalizeUrlKey(url) {
  return String(url || '').trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
}

// Round-robin interleave results across queries so every sub-question is represented,
// dedupe by URL, and cap at maxPages.
function mergeDeepResults(perQuery, maxPages) {
  const seen = new Set();
  const merged = [];
  const maxLen = perQuery.reduce((n, r) => Math.max(n, r.length), 0);
  for (let i = 0; i < maxLen && merged.length < maxPages; i++) {
    for (const results of perQuery) {
      if (merged.length >= maxPages) break;
      const r = results[i];
      if (!r) continue;
      const key = normalizeUrlKey(r.url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }
  return merged;
}

function bodyForResult(r, mode) {
  const highlights = Array.isArray(r.highlights) ? r.highlights.filter(Boolean).join(' … ') : '';
  if (mode === 'deep') {
    const body = (r.text || r.summary || highlights || '').trim();
    return body.slice(0, webDeepCharsPerPage);
  }
  const body = (r.summary || highlights || '').trim();
  return body.slice(0, 2000);
}

function formatSearchContext(queries, results, mode) {
  const lines = results.map((r, i) => {
    const parts = [`[${i + 1}] ${r.title || r.url || 'Untitled'}`];
    if (r.url) parts.push(`URL: ${r.url}`);
    if (r.publishedDate) parts.push(`Published: ${r.publishedDate}`);
    const body = bodyForResult(r, mode);
    if (body) parts.push(body);
    return parts.join('\n');
  });
  const queryLabel = queries.length === 1
    ? `the query "${queries[0]}"`
    : `the queries ${queries.map(q => `"${q}"`).join(', ')}`;
  return `${contextSourceHeader('web')}\n`
    + `The application ran ${queryLabel} against the web and retrieved these results for you; you did not run the search. `
    + `Use them to inform your answer and cite sources as [n] with their URLs when relevant. `
    + `If they are not useful, rely on your own knowledge.\n\n`
    + lines.join('\n\n');
}

function renderSearchSources(queries, results) {
  const div = document.createElement('div');
  div.className = 'message search-sources';

  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = queries.length === 1
    ? `${CONTEXT_SOURCES.web} · "${queries[0]}"`
    : `${CONTEXT_SOURCES.web} · ${queries.length} queries`;
  div.appendChild(title);

  if (queries.length > 1) {
    const q = document.createElement('div');
    q.className = 'search-sources-queries';
    q.textContent = queries.map(x => `“${x}”`).join('  ·  ');
    div.appendChild(q);
  }

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
function noSearchResultsGuard(queryLabel, reason) {
  return `Web search was enabled and attempted for ${queryLabel}, but it ${reason}. `
    + `You did NOT receive any web search results. Do not claim that you searched the web, `
    + `and do not cite or invent web sources or URLs. Answer from your own knowledge and note `
    + `that your information may be out of date.`;
}

// Returns a context string to inject, or null if no search was attempted
// (mode off, empty query, or no API key).
async function runWebSearch(userText, mode) {
  if (mode === 'off' || !userText) return null;
  if (!exaApiKey) {
    addMessage('error', 'Web search is on, but no Exa API key is set. Add one in Settings → General.');
    return null;
  }

  const status = document.createElement('div');
  status.className = 'message search-sources searching';
  status.textContent = 'Understanding your question…';
  messagesEl.appendChild(status);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const queries = await generateSearchQueries(userText, mode);
  const queryLabel = queries.length === 1
    ? `the query "${queries[0]}"`
    : `the queries ${queries.map(q => `"${q}"`).join(', ')}`;
  status.textContent = queries.length === 1
    ? `Searching the web for "${queries[0]}"…`
    : `Searching the web (${queries.length} queries)…`;

  try {
    let results;
    if (mode === 'deep') {
      const perQuery = await Promise.all(queries.map(q =>
        window.api.exaSearch(q, {
          apiKey: exaApiKey,
          numResults: exaNumResults,
          includeText: true,
          textMaxChars: webDeepCharsPerPage,
        }).then(
          res => (Array.isArray(res?.results) ? res.results : []),
          () => []  // one failed query shouldn't sink the whole search
        )
      ));
      results = mergeDeepResults(perQuery, webDeepMaxPages);
    } else {
      const res = await window.api.exaSearch(queries[0], {
        apiKey: exaApiKey,
        numResults: exaNumResults,
        includeSummary: true,
      });
      results = Array.isArray(res?.results) ? res.results : [];
    }
    status.remove();
    if (results.length === 0) return noSearchResultsGuard(queryLabel, 'returned no results');
    renderSearchSources(queries, results);
    return formatSearchContext(queries, results, mode);
  } catch (err) {
    status.remove();
    addMessage('error', `Web search failed: ${err?.message || err}`);
    return noSearchResultsGuard(queryLabel, `failed (${err?.message || err})`);
  }
}

// ── Concept map memory execution ──────────────────────────────────────────────────

const CM_LEVEL_RANK = { macro: 0, topic: 1, subtopic: 2, motif: 3 };
const CM_SUMMARY_LEVELS = new Set(['macro', 'topic']);  // levels verbose enough to include summaries
const CM_STOPWORDS = new Set(['the','and','for','are','but','not','you','your','with','this','that','have','has','had','was','were','what','how','why','when','where','which','who','can','could','would','should','about','into','from','they','them','his','her','its','our','their','been','also','than','then','there','here','some','more','most','such','only','just','like','over','under','does','did','doing']);

function cmTokens(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length >= 3 && !CM_STOPWORDS.has(t));
}

function cmConceptSearchText(c) {
  return [c.canonical_label, ...(Array.isArray(c.aliases) ? c.aliases : []), c.summary]
    .filter(Boolean).join(' ');
}

// ── Concept weighting (mirrors the human-facing 3D vector-map viewer) ──────────
// The viewer sizes each node by evidence weight = (# record refs) + (# evidence chunks),
// normalized to the graph max. We reuse the exact same signal so the model's sense of
// "what's central to the user" matches what the user sees in the 3D map.
// Graphs canonized after the evidence-dedup fix carry exact, uncapped totals; their
// `evidence` array is only a stored sample, so counting rows would undercount them. Older
// graphs have no totals AND repeat rows, so the fallback dedups by chunk before counting
// rather than trusting row count — otherwise a concept seen once in one chunk can outrank
// everything else purely because the extractor emitted its line eight times.
function cmEvidenceWeight(c) {
  const totals = c && c.evidence_totals;
  if (totals && Number.isFinite(totals.chunks) && Number.isFinite(totals.records)) {
    return totals.chunks + totals.records;
  }
  const byChunk = new Map();
  for (const e of (Array.isArray(c.evidence) ? c.evidence : [])) {
    const key = `${e.set || ''}:${e.chunk_id}`;
    if (!byChunk.has(key)) byChunk.set(key, new Set());
    for (const rid of (Array.isArray(e.record_ids) ? e.record_ids : [])) byChunk.get(key).add(rid);
  }
  let records = 0;
  for (const ids of byChunk.values()) records += ids.size;
  return records + byChunk.size;
}

// Per-concept salience index over the WHOLE graph: reference weight (as above), child
// fan-out (hub bonus), and weight normalized to the graph max (0..1, like the viewer's
// node score). Keyed by concept_id.
function cmComputeSalience(allConcepts) {
  const childCount = new Map();
  for (const c of allConcepts) {
    const pid = c.parent_id;
    if (pid && pid !== c.concept_id) childCount.set(pid, (childCount.get(pid) || 0) + 1);
  }
  let maxWeight = 1;
  const info = new Map();
  for (const c of allConcepts) {
    const weight = cmEvidenceWeight(c);
    if (weight > maxWeight) maxWeight = weight;
    info.set(c.concept_id, { weight, children: childCount.get(c.concept_id) || 0, norm: 0 });
  }
  for (const v of info.values()) v.norm = v.weight / maxWeight;
  return info;
}

function cmSalienceOf(c, weights) {
  return (weights && weights.get(c && c.concept_id)) || { weight: 0, children: 0, norm: 0 };
}

// Rank order: reference weight, then hub fan-out, then level, then label.
function cmSalienceCompare(a, b, weights) {
  const ia = cmSalienceOf(a, weights);
  const ib = cmSalienceOf(b, weights);
  return (ib.weight - ia.weight)
    || (ib.children - ia.children)
    || ((CM_LEVEL_RANK[String(a.level || '').toLowerCase()] ?? 9) - (CM_LEVEL_RANK[String(b.level || '').toLowerCase()] ?? 9))
    || String(a.canonical_label || '').localeCompare(String(b.canonical_label || ''));
}

// Inline salience markers appended to a rendered concept line. `·N` = reference weight,
// `★` = a most-central concept (top of the normalized range).
//
// The `[level]` tag used to be emitted here too, and is deliberately gone: the levels do
// not mean what their names say. Canonization assigns them by how often a concept recurs,
// not by how abstract it is — which is why "clock", "magnifier" and "bug fix" all sit at
// macro alongside "cognitive sovereignty", and why half this graph is macro. Printing
// `[macro]` asserted an abstraction hierarchy the data does not support.
function cmMarkers(c, weights) {
  const info = cmSalienceOf(c, weights);
  const w = info.weight > 0 ? ` ·${info.weight}` : '';
  const star = info.norm >= 0.5 ? ' ★' : '';
  return `${w}${star}`;
}

// Smoothed inverse document frequency over the concept corpus, so distinctive tokens
// count more than ubiquitous ones when scoring relevance.
function cmBuildIdf(concepts) {
  const df = new Map();
  const total = Math.max(1, concepts.length);
  for (const c of concepts) {
    for (const t of new Set(cmTokens(cmConceptSearchText(c)))) df.set(t, (df.get(t) || 0) + 1);
  }
  return (t) => Math.log((total + 1) / ((df.get(t) || 0) + 1)) + 1;
}

function cmSortConcepts(concepts) {
  return concepts.slice().sort((a, b) => {
    const ra = CM_LEVEL_RANK[String(a.level || '').toLowerCase()] ?? 9;
    const rb = CM_LEVEL_RANK[String(b.level || '').toLowerCase()] ?? 9;
    return ra - rb || String(a.canonical_label || '').localeCompare(String(b.canonical_label || ''));
  });
}

async function loadConceptGraph(path) {
  if (conceptGraphCache.path === path && conceptGraphCache.graph) return conceptGraphCache.graph;
  const graph = await window.api.analysisReadGraph(path);
  conceptGraphCache = { path, graph };
  return graph;
}

// Overview (hierarchy arrangement): a parent → child outline, capped at maxLines.
// Siblings/roots are ordered by salience so the most central concepts lead — and if the
// budget truncates, the heaviest branches survive. Concepts whose parent is filtered out
// become roots. Each line is annotated with its reference weight (·N / ★).
function cmRenderTree(sortedConcepts, maxLines, weights) {
  const byId = new Map();
  for (const c of sortedConcepts) if (c.concept_id) byId.set(c.concept_id, c);
  const children = new Map();
  const roots = [];
  for (const c of sortedConcepts) {
    const pid = c.parent_id;
    if (pid && pid !== c.concept_id && byId.has(pid)) {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(c);
    } else {
      roots.push(c);
    }
  }
  roots.sort((a, b) => cmSalienceCompare(a, b, weights));
  for (const arr of children.values()) arr.sort((a, b) => cmSalienceCompare(a, b, weights));
  const lines = [];
  const visited = new Set();
  function walk(c, depth) {
    if (lines.length >= maxLines || (c.concept_id && visited.has(c.concept_id))) return;
    if (c.concept_id) visited.add(c.concept_id);
    const label = (c.canonical_label || c.concept_id || 'Untitled').trim();
    let line = `${'  '.repeat(depth)}- ${label}${cmMarkers(c, weights)}`;
    const summary = (c.summary || '').trim();
    if (CM_SUMMARY_LEVELS.has(String(c.level || '').toLowerCase()) && summary && summary !== label) {
      line += `: ${summary.slice(0, 200)}`;
    }
    lines.push(line);
    for (const k of (children.get(c.concept_id) || [])) {
      if (lines.length >= maxLines) break;
      walk(k, depth + 1);
    }
  }
  for (const r of roots) { if (lines.length >= maxLines) break; walk(r, 0); }
  for (const c of sortedConcepts) {  // any left over (cycles / orphans)
    if (lines.length >= maxLines) break;
    if (!c.concept_id || !visited.has(c.concept_id)) walk(c, 0);
  }
  return { text: lines.join('\n'), shown: lines.length };
}

// Overview (salience / alpha arrangements): a flat ranked list, mirroring the viewer's
// "size" and "alpha" layouts. Salience = most-referenced first; alpha = by label.
function cmRenderRanked(concepts, maxItems, weights, byIdAll, by) {
  const arr = concepts.slice();
  if (by === 'alpha') {
    arr.sort((a, b) => String(a.canonical_label || '').localeCompare(String(b.canonical_label || '')));
  } else {
    arr.sort((a, b) => cmSalienceCompare(a, b, weights));
  }
  const lines = arr.slice(0, maxItems).map(c => {
    const parent = c.parent_id ? byIdAll.get(c.parent_id) : null;
    const anchor = parent ? ` (under “${parent.canonical_label || parent.concept_id}”)` : '';
    const summary = (c.summary || '').trim();
    const sum = CM_SUMMARY_LEVELS.has(String(c.level || '').toLowerCase()) && summary
      ? `: ${summary.slice(0, 200)}` : '';
    return `- ${c.canonical_label || c.concept_id}${anchor}${cmMarkers(c, weights)}${sum}`;
  });
  return { text: lines.join('\n'), shown: lines.length };
}

// Relevant: concepts whose label/aliases/summary overlap the message, ranked by
// IDF-weighted lexical overlap (distinctive tokens count more) and lightly boosted by
// salience so, among similarly-relevant concepts, the more central to the user lead.
function cmRenderRelevant(concepts, byIdAll, userText, maxItems, weights, idf) {
  const q = new Set(cmTokens(userText));
  if (!q.size) return { text: '', shown: 0 };
  const scored = [];
  for (const c of concepts) {
    let lex = 0;
    for (const t of new Set(cmTokens(cmConceptSearchText(c)))) if (q.has(t)) lex += idf(t);
    if (lex <= 0) continue;
    const norm = cmSalienceOf(c, weights).norm;
    scored.push({ c, score: lex * (1 + 0.35 * norm) });
  }
  scored.sort((a, b) => b.score - a.score
    || String(a.c.canonical_label || '').localeCompare(String(b.c.canonical_label || '')));
  const top = scored.slice(0, maxItems);
  const lines = top.map(({ c }) => {
    const parent = c.parent_id ? byIdAll.get(c.parent_id) : null;
    const anchor = parent ? ` (under “${parent.canonical_label || parent.concept_id}”)` : '';
    const summary = (c.summary || '').trim();
    const sum = summary ? `: ${summary.slice(0, 220)}` : '';
    return `- ${c.canonical_label || c.concept_id}${anchor}${cmMarkers(c, weights)}${sum}`;
  });
  return { text: lines.join('\n'), shown: lines.length };
}

function cmRenderTimeline(events, conceptIdFilter, maxItems) {
  let evs = Array.isArray(events) ? events.slice() : [];
  if (conceptIdFilter) {
    evs = evs.filter(e => Array.isArray(e.concept_ids) && e.concept_ids.some(id => conceptIdFilter.has(id)));
  }
  evs.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  return evs.slice(0, maxItems)
    .map(e => `- ${e.timestamp || '—'}: ${(e.summary || '').trim().slice(0, 200)}`)
    .join('\n');
}

// Cut the rendered map to a character budget on whole-line boundaries. Ordering has
// already put the most salient concepts first in every arrangement, so trimming the tail
// drops the least-central entries — the ones whose bare labels contribute vocabulary
// without meaning. `shown` is corrected so the on-screen note reports what was really sent.
function cmTrimToBudget(rendered, maxChars) {
  if (!maxChars || !rendered.text || rendered.text.length <= maxChars) return rendered;
  const kept = [];
  let used = 0;
  for (const line of rendered.text.split('\n')) {
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { text: kept.join('\n'), shown: kept.length, trimmed: true };
}

function cmDisplayName(path, graph) {
  return (graph && graph.graph_id) || path.split(/[\\/]/).pop() || 'concept map';
}

function renderConceptMapNote(info) {
  const div = document.createElement('div');
  div.className = 'message search-sources concept-map-note';
  const title = document.createElement('div');
  title.className = 'search-sources-title';
  const detail = info.kind === 'primed' ? 'primed for this chat'
    : info.kind === 'slice' ? 'relevant entries'
    : 'memory';
  title.textContent = `${CONTEXT_SOURCES.map} · ${detail} · ${info.name}`;
  div.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'search-sources-queries';
  sub.textContent = `${info.mode} · ${info.shown}/${info.total} concepts`
    + `${info.trimmed ? ' (char ceiling)' : ''}`
    + `${info.timeline ? ' · timeline' : ''} · levels: ${info.levels.join(', ') || 'none'}`
    + `${conceptMapMinEvidence > 0 ? ` · min evidence ${conceptMapMinEvidence}` : ''}`;
  div.appendChild(sub);
  messagesEl.appendChild(div);
  return div;
}

const CM_LEGEND = `Legend: \`·N\` = how often a concept recurs across the user's history (higher = more often raised, which is not the same as more important); \`★\` marks the most frequently recurring. These are counts from their past conversations, not a ranking of significance.`;

// Slice size for follow-up messages. Small on purpose: the whole map is already sitting in
// the prefix, so this exists to point at the handful of entries bearing on THIS message,
// not to restate the map. Small also means it cannot do much laundering from the
// high-influence position next to the question.
const CM_SLICE_MAX_CONCEPTS = 40;
const CM_SLICE_MAX_CHARS = 4000;

// Shared load + filter for both the prime and the per-message slice. Returns null (after
// surfacing an error where one is useful) when the map cannot be built.
async function cmPrepare({ quiet = false } = {}) {
  const path = await cmResolvePath();
  if (!path) {
    if (!quiet) addMessage('error', 'Concept map memory is on, but there are no concept maps on disk yet. Run Data Analysis to build one, or pick a map in Settings → Concept map.');
    return null;
  }
  if (!conceptMapLevels.length) {
    if (!quiet) addMessage('error', 'Concept map memory is on, but no levels are selected. Enable at least one in Settings → Concept map.');
    return null;
  }

  let graph;
  try {
    graph = await loadConceptGraph(path);
  } catch (err) {
    if (!quiet) addMessage('error', `Concept map failed to load: ${err?.message || err}`);
    return null;
  }

  const allConcepts = Array.isArray(graph?.concepts) ? graph.concepts : [];
  if (!allConcepts.length) return null;

  const byIdAll = new Map();
  for (const c of allConcepts) if (c.concept_id) byIdAll.set(c.concept_id, c);

  const levelSet = new Set(conceptMapLevels);
  const atLevel = allConcepts.filter(c => levelSet.has(String(c.level || '').toLowerCase()));
  if (!atLevel.length) return null;

  // A graph whose concepts carry no evidence arrays scores 0 everywhere, and the threshold
  // would then silently delete the entire map. Treat that as "this graph does not record
  // evidence" and fall back to the unfiltered set rather than injecting nothing.
  let filtered = atLevel.filter(c => cmEvidenceWeight(c) >= conceptMapMinEvidence);
  if (!filtered.length) filtered = atLevel;

  // Salience (evidence weight) + IDF depend only on the graph, not the level filter, so
  // memoize them on the cached graph object to avoid recomputing every message.
  if (!graph.__cmWeights) graph.__cmWeights = cmComputeSalience(allConcepts);
  if (!graph.__cmIdf) graph.__cmIdf = cmBuildIdf(allConcepts);

  return {
    graph,
    allConcepts,
    filtered,
    byIdAll,
    weights: graph.__cmWeights,
    idf: graph.__cmIdf,
    name: cmDisplayName(path, graph),
  };
}

// The one-time orientation: the whole map at the configured accuracy level, rendered once
// and then frozen for the life of the chat by its caller. Goes at the head of the request,
// which does two things at once — it keeps the prompt prefix byte-identical across turns so
// the server's KV cache can be reused instead of re-reading ~33k tokens every message, and
// it moves the map away from the position immediately before the question, where it was
// exerting the most pull on the wording of answers.
async function buildConceptMapPrime() {
  const p = await cmPrepare();
  if (!p) return null;

  const renderOverview = (maxLines) => {
    if (conceptMapArrangement === 'salience') return cmRenderRanked(p.filtered, maxLines, p.weights, p.byIdAll, 'salience');
    if (conceptMapArrangement === 'alpha') return cmRenderRanked(p.filtered, maxLines, p.weights, p.byIdAll, 'alpha');
    return cmRenderTree(cmSortConcepts(p.filtered), maxLines, p.weights);
  };

  let rendered = cmTrimToBudget(renderOverview(conceptMapMaxConcepts), conceptMapMaxChars);
  if (!rendered.text) return null;

  let timeline = '';
  if (conceptMapIncludeEvents && Array.isArray(p.graph.events) && p.graph.events.length) {
    timeline = cmRenderTimeline(p.graph.events, null, 40);
  }

  renderConceptMapNote({
    kind: 'primed',
    name: p.name,
    mode: `overview · ${conceptMapArrangement}`,
    shown: rendered.shown,
    total: p.allConcepts.length,
    trimmed: !!rendered.trimmed,
    timeline: !!timeline,
    levels: conceptMapLevels,
  });

  const parts = [
    `${contextSourceHeader('map')}\n${conceptMapFraming || CM_DEFAULT_FRAMING}`,
    `\nYou are being shown this map once, here, as orientation for the whole conversation. It is not tied to any particular message and does not need answering.`,
    `\n### ${p.name} — ${rendered.shown} of ${p.allConcepts.length} concepts · overview / ${conceptMapArrangement} · levels: ${conceptMapLevels.join(', ')}`,
    CM_LEGEND,
    rendered.text,
  ];
  if (timeline) parts.push(`\n## Timeline (events)\n${timeline}`);
  return parts.join('\n');
}

// The per-message slice: the few entries that bear on what was just asked, injected next to
// the question. `standalone` is the pre-priming behaviour (relevant mode), where this is the
// only concept-map content in the request and so carries the full framing and budget.
async function buildConceptMapSlice(userText, { standalone = false } = {}) {
  const p = await cmPrepare({ quiet: !standalone });
  if (!p) return null;

  const maxConcepts = standalone ? conceptMapMaxConcepts : CM_SLICE_MAX_CONCEPTS;
  let rendered = cmRenderRelevant(p.filtered, p.byIdAll, userText, maxConcepts, p.weights, p.idf);

  if (!rendered.shown) {
    // Nothing in the map touches this message. With a primed map already in context there
    // is nothing useful to add, so stay quiet rather than padding with a generic overview.
    if (!standalone) return null;
    if (conceptMapArrangement === 'salience' || conceptMapArrangement === 'alpha') {
      rendered = cmRenderRanked(p.filtered, Math.min(conceptMapMaxConcepts, 60), p.weights, p.byIdAll, conceptMapArrangement);
    } else {
      rendered = cmRenderTree(cmSortConcepts(p.filtered), Math.min(conceptMapMaxConcepts, 60), p.weights);
    }
  }

  rendered = cmTrimToBudget(rendered, standalone ? conceptMapMaxChars : CM_SLICE_MAX_CHARS);
  if (!rendered.text) return null;

  renderConceptMapNote({
    kind: standalone ? 'relevant' : 'slice',
    name: p.name,
    mode: 'relevant to this message',
    shown: rendered.shown,
    total: p.allConcepts.length,
    trimmed: !!rendered.trimmed,
    timeline: false,
    levels: conceptMapLevels,
  });

  if (standalone) {
    return [
      `${contextSourceHeader('map')}\n${conceptMapFraming || CM_DEFAULT_FRAMING}`,
      `\n### ${p.name} — ${rendered.shown} of ${p.allConcepts.length} concepts · relevant to this message · levels: ${conceptMapLevels.join(', ')}`,
      CM_LEGEND,
      rendered.text,
    ].join('\n');
  }
  return `${contextSourceHeader('map')}\nFrom the concept map you were shown at the start of this conversation, these entries touch on the message below. They are the user's own recurring topics, offered so you can pitch the answer at the right depth and connect it to what they already work on — not terminology to adopt, and not a subject to write about unless they asked about it.\n\n${rendered.text}`;
}

// ── On-demand concept map: the concept_search tool ────────────────────────────────
// The third mode. Instead of putting the map in front of the model — ~22k tokens of it in
// overview mode — nothing is injected and the model is given one function to pull entries
// with. It is the most direct lever available on vocabulary bleed short of changing the
// analysis pipeline: a handful of concepts the model actually asked for cannot laundered
// into an answer the way a thousand ambient lines of framework vocabulary can.
//
// Costs, so the trade is visible: an extra round trip whenever the model does search, and
// reasoning off for the whole exchange (see the tool loop). It also puts retrieval in the
// model's hands, so a question it misjudges gets no map at all — which is the point in one
// direction and a regression in the other.

const CM_TOOL_NAME = 'concept_search';
const CM_TOOL_DEFAULT_LIMIT = 8;
const CM_TOOL_MAX_LIMIT = 25;
// Rounds of call → result → call allowed before the tool is withdrawn and the model has to
// answer with what it has. Three covers "broad look, then a narrower follow-up" with room to
// spare; the cap exists because a model that keeps re-querying otherwise never answers.
const CM_TOOL_MAX_ROUNDS = 3;

const CM_TOOL_DEF = {
  type: 'function',
  function: {
    name: CM_TOOL_NAME,
    description: "Search the user's own concept map — the topics they have thought and written about, distilled by this application from their past conversations — and return the matching entries with short descriptions. Call it when the answer depends on what this particular user works on, cares about, or already knows. Query the subject the user actually asked about. Use \"*\" only when the question is about their interests in general; it returns their most frequently recurring concepts overall, which have nothing to do with any specific subject.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The subject to look for, in a few words — normally the subject of the question. Use "*" only for a general picture of what they think about.',
        },
        limit: {
          type: 'integer',
          description: `Maximum entries to return (default ${CM_TOOL_DEFAULT_LIMIT}, maximum ${CM_TOOL_MAX_LIMIT}).`,
        },
      },
      required: ['query'],
    },
  },
};

// Queries with nothing specific to match on. The model really does this — the feasibility
// test caught it opening with concept_search({"query":"*"}) — and lexical retrieval returns
// nothing for those, from which it concluded the map was empty. Broad queries are answered
// from salience instead, which is the honest answer to "what does this user think about".
const CM_WILDCARD_QUERY = /^[\s*%_.…"'?-]*$/;
// Tested against the query's tokens, not the raw string. "my topics" survives the regex above
// but lexically matches the two concepts that happen to contain the word "topics" — which is
// worse than returning nothing, because those two then stand as the answer to "what does this
// user think about". A query whose every meaningful token is one of these is asking for the
// map in general, whatever its phrasing. Short words ("my", "me") and question words ("what",
// "how", "about") are already dropped by cmTokens as stopwords or by length.
const CM_BROAD_TOKENS = new Set([
  'all', 'any', 'anything', 'everything', 'general', 'generally', 'overview', 'summary',
  'topic', 'topics', 'concept', 'concepts', 'interest', 'interests', 'theme', 'themes',
  'subject', 'subjects', 'area', 'areas', 'domain', 'domains', 'user', 'mine', 'main',
  'primary', 'key', 'important', 'idea', 'ideas', 'thing', 'things', 'stuff', 'everyone',
  'think', 'thinks', 'thinking', 'thought', 'thoughts', 'know', 'knows', 'care', 'cares',
  'work', 'works', 'map', 'everybody',
]);

function cmIsBroadQuery(q, tokens) {
  if (!q || CM_WILDCARD_QUERY.test(q)) return true;
  if (!tokens.size) return true;
  for (const t of tokens) if (!CM_BROAD_TOKENS.has(t)) return false;
  return true;
}

function cmToolEntry(c, byIdAll, weights) {
  const parent = c.parent_id ? byIdAll.get(c.parent_id) : null;
  const summary = String(c.summary || '').trim();
  const entry = {
    concept: c.canonical_label || c.concept_id,
    recurrence: cmSalienceOf(c, weights).weight,
  };
  if (parent) entry.under = parent.canonical_label || parent.concept_id;
  if (summary) entry.summary = summary.slice(0, 300);
  return entry;
}

function renderConceptSearchNote(info) {
  const div = document.createElement('div');
  div.className = 'message search-sources concept-map-note';
  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = `${CONTEXT_SOURCES.map} · searched by the model · ${info.name}`;
  div.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'search-sources-queries';
  sub.textContent = info.matched === 'none'
    ? `“${info.query}” → nothing in the map matches (${info.total} concepts searched)`
    : info.matched === 'blocked'
      ? `“${info.query}” → declined · general list withheld after a miss on this question`
      : `“${info.query}” → ${info.shown} of ${info.total} concepts`
        + (info.matched === 'salience' ? ' · broad query, most-recurring returned' : '');
  div.appendChild(sub);
  messagesEl.appendChild(div);
  return div;
}

// Runs against the same level / minimum-evidence filtered set the injected modes use, so what
// the model can reach is exactly what the user configured — the mode changes when the map is
// consulted, not which parts of it exist.
//
// `state` carries what has already been searched during THIS send (see cmNewToolState), which
// is what makes the guard below possible.
async function cmConceptSearch({ query, limit } = {}, state = null) {
  const p = await cmPrepare({ quiet: true });
  if (!p) {
    return {
      error: 'No concept map is available. Answer from the conversation and your own knowledge, and say the map was unavailable if it matters.',
      concepts: [],
    };
  }

  const n = Math.min(CM_TOOL_MAX_LIMIT, Math.max(1, parseInt(limit, 10) || CM_TOOL_DEFAULT_LIMIT));
  const q = String(query ?? '').trim();
  const queryTokens = new Set(cmTokens(q));
  let matched = 'lexical';
  let picked = [];

  if (cmIsBroadQuery(q, queryTokens)) {
    matched = 'salience';
  } else {
    // A longer query has to be matched on more than one of its words. One token in three is
    // usually coincidence, and coincidence here is expensive: "kubernetes ingress controller"
    // hit two concepts about game controllers on the strength of "controller" alone, which
    // the model would then have taken as the user's view of Kubernetes. Short queries keep the
    // single-token rule — there is nothing else to go on.
    const minMatched = queryTokens.size >= 3 ? 2 : 1;
    const scored = [];
    for (const c of p.filtered) {
      let lex = 0;
      let hits = 0;
      for (const t of new Set(cmTokens(cmConceptSearchText(c)))) {
        if (queryTokens.has(t)) { lex += p.idf(t); hits += 1; }
      }
      if (hits >= minMatched) scored.push({ c, score: lex * (1 + 0.35 * cmSalienceOf(c, p.weights).norm) });
    }
    scored.sort((a, b) => b.score - a.score
      || String(a.c.canonical_label || '').localeCompare(String(b.c.canonical_label || '')));
    picked = scored.slice(0, n).map(x => x.c);
    // A specific query that matched nothing does NOT fall back to salience. Handing back the
    // user's top concepts because they asked about, say, Kubernetes would park their personal
    // vocabulary next to a question it has nothing to do with — the exact laundering this mode
    // exists to prevent, and worse here than in the injected modes because the model asked for
    // it and will treat it as an answer. Report the miss instead; the risk of an empty list
    // reading as an empty map is handled by saying outright that it is not one.
    if (!picked.length) matched = 'none';
  }

  // The guard that prose could not enforce. Measured: asked about Kubernetes ingress, the model
  // searched for it specifically, was told the map has nothing on it — and said so, correctly —
  // then immediately searched "*", took the general list, and framed Kubernetes through the
  // user's personal concepts anyway. Warnings in the note did not stop it, because the material
  // was there and the model wanted something to connect to. So after a miss in the same send,
  // the general list stops being available: there is nothing to connect, and the honest answer
  // is the one it had already reached.
  if (matched === 'salience' && state && state.missed.length) {
    renderConceptSearchNote({ query: q || '*', matched: 'blocked', shown: 0, total: p.allConcepts.length, name: p.name });
    return {
      query: q || '*',
      matched: 'blocked',
      returned: 0,
      total_concepts: p.allConcepts.length,
      concepts: [],
      note: `You already searched this map for "${state.missed[state.missed.length - 1]}" and it holds nothing on that subject. A general list of the user's most recurring concepts is not a substitute for that answer — those concepts have no bearing on what was asked, and connecting them to it would misrepresent the user. The map has nothing to contribute to this question: say so plainly and answer from your own knowledge.`,
    };
  }

  if (matched === 'salience') {
    picked = p.filtered.slice().sort((a, b) => cmSalienceCompare(a, b, p.weights)).slice(0, n);
  }
  if (matched === 'none' && state) state.missed.push(q);

  const RECURRENCE_NOTE = '"recurrence" counts how often a concept comes up across the user\'s past conversations — a frequency count, not a ranking of importance.';
  // The broad-query warning is doing real work, not being polite. Measured: asked "given what I
  // usually work on, how should I approach Kubernetes ingress controllers", the model queried
  // "*", got this list, and framed Kubernetes in terms of the user's personal concepts — the
  // very laundering this mode exists to prevent, arriving through the fallback that was added
  // to stop a different failure. The list is unavoidably general, so it has to say so.
  const note = matched === 'lexical'
    ? `These entries matched your query. ${RECURRENCE_NOTE}`
    : matched === 'salience'
      ? `This is a general list: the user's most frequently recurring concepts overall, NOT results for any particular subject. ${RECURRENCE_NOTE} If the question was about a specific subject, these concepts are almost certainly unrelated to it — do not frame that subject in their terms, and search again with the subject itself as the query. Use this list only when the question really is about the user's interests in general.`
      : `The map holds ${p.filtered.length} concepts at the levels in use and none of them matched "${q}". The map is NOT empty — this subject simply is not in it, which means the user has not written about it. Answer from your own knowledge, and do not substitute their other concepts for it. If you think it is there under different words, you may search once more with different terms.`;

  renderConceptSearchNote({
    query: q || '*',
    matched,
    shown: picked.length,
    total: p.allConcepts.length,
    name: p.name,
  });

  // "no match" is a real, useful answer, so it is reported as one rather than as an error —
  // the model is told the subject is absent and to answer from its own knowledge.

  return {
    query: q || '*',
    matched,
    returned: picked.length,
    total_concepts: p.allConcepts.length,
    concepts: picked.map(c => cmToolEntry(c, p.byIdAll, p.weights)),
    note,
  };
}

// Arguments arrive as a JSON string reassembled from stream fragments, so a malformed one is
// a real possibility. Hand every failure back as a tool result rather than throwing: the model
// can then correct the call or answer without it, where an exception would kill the send.
async function cmExecuteToolCall(call, state = null) {
  const name = call?.function?.name || '';
  if (name !== CM_TOOL_NAME) {
    return { error: `Unknown tool "${name}". The only tool available is ${CM_TOOL_NAME}.` };
  }
  const raw = call?.function?.arguments || '';
  let args = {};
  if (raw.trim()) {
    try {
      args = JSON.parse(raw);
    } catch {
      return { error: `Could not parse those arguments as JSON: ${raw.slice(0, 200)}. Retry with an object like {"query": "..."}.` };
    }
  }
  try {
    return await cmConceptSearch(args, state);
  } catch (err) {
    return { error: `${CM_TOOL_NAME} failed: ${err?.message || err}` };
  }
}

// One per send. Scoped to the send rather than the chat because the guard it drives is about
// one question: a miss on an earlier turn says nothing about what this turn may legitimately
// look up.
function cmNewToolState() {
  return { missed: [] };
}

// The tool ships only in on-demand mode. In overview mode the whole map is already in the
// prefix and in relevant mode a slice is attached to the message, so offering a search there
// would only let the model re-fetch what it has been handed.
async function cmToolsForRequest() {
  if (!conceptMapEnabled || conceptMapMode !== 'ondemand') return null;
  // Switching a primed chat over to on-demand does not un-prime it — the map stays in the
  // request for the rest of that chat, because the model has already seen it and dropping it
  // would invalidate the cached prefix for nothing. But then the whole map IS in the prompt,
  // so attaching a search over it is redundant and says something untrue: the preamble would
  // announce a tool for looking up what is already sitting in front of the model. Measured
  // before this guard: 91,685 chars of map plus `concept_search`, in the same request.
  if (primedConceptMap) return null;
  if (!(await cmResolvePath())) return null;
  return [CM_TOOL_DEF];
}

// ── Local library context layer ───────────────────────────────────────────────────
// Each source line is "Zone label | path" or just "path" (zone defaults to the basename).
function libParseSources(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const bar = line.indexOf('|');
    if (bar >= 0) return { zone: line.slice(0, bar).trim(), path: line.slice(bar + 1).trim() };
    return { zone: '', path: line };
  }).filter(s => s.path);
}

// "All" packing: whole files, recent first (Rust already sorted by mtime desc), to budget.
function libPackAll(files, budget) {
  const out = [];
  let used = 0;
  for (const f of files) {
    if (used >= budget) break;
    let text = String(f.text || '').trim();
    if (!text) continue;
    if (text.length > budget - used) text = text.slice(0, Math.max(0, budget - used)).trim() + '\n…[truncated]';
    out.push({ file: f, snippet: text });
    used += text.length;
  }
  return out;
}

// Paragraphs, with a bare markdown heading folded into the section it introduces. A
// heading alone is a label, not content: left as its own block it can be *selected* as an
// excerpt, and a Hermes document from the workspace template always opens with
// "## Current question", so the no-match fallback below was structurally guaranteed to
// return that and nothing else. Folding it in also lets a section's heading words help
// score its prose, which is usually where the subject word actually appears.
function libSplitBlocks(text) {
  const raw = String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const out = [];
  let heading = '';
  for (const b of raw) {
    if (/^#{1,6}\s+\S/.test(b) && !b.includes('\n')) {
      heading = heading ? `${heading}\n${b}` : b;
      continue;
    }
    out.push(heading ? `${heading}\n${b}` : b);
    heading = '';
  }
  if (heading) out.push(heading);   // trailing heading with nothing under it
  return out;
}

// Pick the highest-scoring paragraphs of a file for the query, kept in original order.
function libBestBlocks(text, q, idf, cap) {
  const full = String(text || '').trim();
  if (!full) return '';
  // Relevance-trimming a file that already fits is pure loss. Measured: asked "what Node
  // version, and where does CI run", a 600-character note was reduced to the Node paragraph
  // alone against a 24,000-character budget — the CI paragraph scored zero because cmTokens
  // drops tokens under three characters ("ci") and does not stem ("run" vs "runs"), so the
  // half of the answer the query happened to word differently was dropped. Selection is for
  // files too big to send, not for deciding what the user meant.
  if (full.length <= cap) return full;

  const blocks = libSplitBlocks(full);
  if (!blocks.length) return '';
  const scored = blocks.map((b, i) => {
    const toks = new Set(cmTokens(b));
    let s = 0;
    for (const t of q) if (toks.has(t)) s += idf(t);
    return { b, i, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const chosen = [];
  const taken = new Set();
  let used = 0;
  for (const { b, i } of scored) {
    if (used >= cap) break;
    let bb = b;
    if (bb.length > cap - used) bb = bb.slice(0, Math.max(0, cap - used)) + '…';
    chosen.push({ i, b: bb });
    taken.add(i);
    used += bb.length + 4;
  }
  // Top up in document order with whatever else fits. The file was already judged relevant;
  // leaving budget unspent to withhold its other paragraphs helps nothing, and it is how a
  // question with two halves loses one of them.
  for (let i = 0; i < blocks.length && used < cap; i++) {
    if (taken.has(i)) continue;
    const b = blocks[i];
    if (b.length + 4 > cap - used) continue;
    chosen.push({ i, b });
    taken.add(i);
    used += b.length + 4;
  }
  if (!chosen.length) return blocks[0].slice(0, cap);
  chosen.sort((a, b) => a.i - b.i);
  // Only mark a gap where one was actually skipped.
  return chosen.map((c, n) => (n > 0 && c.i !== chosen[n - 1].i + 1 ? '…\n' : '') + c.b).join('\n');
}

// "Relevant" packing: IDF-rank files against the message, take the best blocks of each.
//
// `order` (optional) supplies the ranking from outside — see libSemanticOrder. When it is
// given, only the ORDER changes: block selection, the per-file share and the budget loop are
// the same code, so the semantic path cannot alter how much context a message gets. It also
// skips the empty-query bail-out below, which is the point: "what does td do" tokenizes to
// nothing here (3-char floor, and every other word is a stopword), so the lexical path
// returns no files at all for a question a semantic ranker answers immediately.
function libPackRelevant(files, userText, budget, order = null) {
  const q = new Set(cmTokens(userText));
  if (!q.size && !order) return [];
  const df = new Map();
  const fileToks = files.map(f => {
    const toks = new Set(cmTokens(`${f.name || ''} ${f.text || ''}`));
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
    return toks;
  });
  const total = files.length || 1;
  const idf = (t) => Math.log((total + 1) / ((df.get(t) || 0) + 1)) + 1;
  const scored = order
    ? order.map(f => ({ f, s: 1 }))
    : files.map((f, i) => {
      let s = 0;
      for (const t of q) if (fileToks[i].has(t)) s += idf(t);
      return { f, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const out = [];
  let used = 0;
  const perFile = Math.max(500, Math.floor(budget / Math.min(6, scored.length)));
  for (const { f } of scored) {
    if (used >= budget) break;
    const snippet = libBestBlocks(f.text || '', q, idf, Math.min(perFile, budget - used));
    if (!snippet) continue;
    out.push({ file: f, snippet });
    used += snippet.length;
  }
  return out;
}

/* ── Semantic ordering via the local vault-search service ─────────────────────────
   OPTIONAL, LOCAL, AND IT ONLY REORDERS. The lexical ranker above scores a file by
   summing IDF over query terms, which measurably fails in three ways on a notes
   corpus: tokens under three characters do not exist (`td`, `ci`, `rg`), `run` and
   `runs` are different terms, and one passing mention ranks level with a document
   about the subject. `vault-search` (a separate local project, 127.0.0.1:5278) indexes
   the same kind of material with an embedding model and answers with a ranked list.

   THREE PROPERTIES THIS MUST HAVE, and they are why it looks like this:

   1. IT CANNOT BREAK A MESSAGE. One short-timeout request; any failure returns null and
      the caller falls through to the lexical path unchanged. After one failure the
      service is not probed again for the rest of the session — on a machine that has
      never heard of vault-search (this is a public repo) the cost is one refused
      connection per app run, not one per message.

   ⚠ IT GOES THROUGH RUST, NOT `fetch`. The webview's CSP is `default-src 'self'` with no
   `connect-src`, so a page-side fetch to a loopback port is blocked outright — measured
   by driving the running app over CDP, where it read as a bare "Failed to fetch". The
   fix is NOT to widen the CSP: `connect-src http://127.0.0.1:*` in a public repo would
   let anything this app renders, model output included, reach every loopback service on
   a user's machine. `library_search` in lib.rs makes the call instead, which is also how
   every other network call in this app already works.
   2. IT ONLY REORDERS FILES THE APP ALREADY READ. `library_collect` stays the single
      source of truth for WHICH files are in scope; anything vault-search returns that
      is not in that set is dropped. Your library sources and its indexed roots need not
      be the same folders, and where they do not overlap this simply does nothing.
   3. IT CHANGES NO BUDGET. The ordered list goes back through libPackRelevant, so the
      same block selection and the same character budget apply.                        */

let libSearchOffUntilReload = false;   // one failure is enough; see property 1

// WHY the lexical path ran when the semantic one was asked for. Property 2 makes a
// non-overlapping configuration a no-op *by design*, but it used to be a SILENT one: the
// only trace was `ranked: lexical` in the note, which is also what a plain miss looks
// like. Measured 2026-08-12 — this machine's library sources were two files in Documents\
// and vault-search indexed neither, so the feature had never once engaged in daily use and
// nothing said so. The design is unchanged; only the silence is.
let libSemanticWhy = '';

const libPathKey = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

// How many of these files sit under a root the service actually indexes. A prefix test, so
// it over-counts (the service applies its own extension allowlist and exclusions on top) —
// but it is the difference between "wrong folders" and "right folders, weak match", and
// only the first is a mistake the user can fix. null = the service did not report roots.
function libCountIndexed(files, roots) {
  const rs = (Array.isArray(roots) ? roots : []).map(r => libPathKey(r).replace(/\/+$/, '') + '/');
  if (!rs.length) return null;
  return files.filter(f => rs.some(r => libPathKey(f.path).startsWith(r))).length;
}

/** Ranked subset of `files`, or null to mean "use the lexical path". */
async function libSemanticOrder(userText, files) {
  libSemanticWhy = '';
  if (!librarySemantic) return null;
  if (libSearchOffUntilReload) { libSemanticWhy = 'vault-search unreachable'; return null; }
  if (!userText || !files.length) return null;
  if (!window.api?.librarySearch) return null;

  const base = String(librarySearchUrl || '').replace(/\/$/, '');
  if (!base) return null;

  let hits, roots;
  try {
    // Ask for more than the budget can hold: results outside the library's own file set
    // are dropped below, so the useful count is only known after intersecting.
    const body = await window.api.librarySearch(base, userText.slice(0, 400), 25);
    hits = Array.isArray(body?.results) ? body.results : [];
    roots = body?.roots;
  } catch {
    libSearchOffUntilReload = true;
    libSemanticWhy = 'vault-search unreachable';
    return null;
  }

  const byPath = new Map(files.map(f => [libPathKey(f.path), f]));
  const ordered = [];
  const taken = new Set();
  for (const h of hits) {
    const f = byPath.get(libPathKey(h.path));
    if (!f || taken.has(f)) continue;
    taken.add(f);
    ordered.push(f);
  }
  // A single overlapping file is not a ranking. Fall back rather than hand the model one
  // note because it happened to be the only one both systems know about.
  if (ordered.length >= 2) return ordered;
  const indexed = libCountIndexed(files, roots);
  libSemanticWhy = indexed === 0
    ? `vault-search indexes none of these ${files.length} file${files.length === 1 ? '' : 's'}`
    : `vault-search matched ${ordered.length} of ${files.length}`;
  return null;
}

/* One line for Settings → "Test read sources": would the semantic ranker actually engage on
   THESE sources? The in-chat note can only report this after a message has already been
   sent with the wrong configuration; this answers it while the paths are still on screen,
   which is where a folder mismatch is cheap to fix. The probe is a real search — /api/search
   is the only endpoint the Rust command will call — and its query is irrelevant, because
   what is wanted from the reply is `roots`. */
async function libSemanticCoverage(files) {
  if (!librarySemantic) return 'semantic ordering off';
  const base = String(librarySearchUrl || '').replace(/\/$/, '');
  if (!base || !window.api?.librarySearch) return 'vault-search not configured';
  let roots;
  try {
    roots = (await window.api.librarySearch(base, 'index coverage probe', 1))?.roots;
  } catch (err) {
    return `vault-search unreachable (${String(err?.message || err).slice(0, 60)})`;
  }
  const n = libCountIndexed(files, roots);
  if (n === null) return 'vault-search up (roots unknown — older service)';
  if (n === 0) return `⚠ vault-search indexes NONE of these files — semantic ordering will never run`;
  if (n < 2) return `⚠ vault-search indexes only ${n} of ${files.length} — needs 2+ to rank`;
  return `vault-search indexes ${n} of ${files.length}`;
}

function renderLibraryNote(info) {
  const div = document.createElement('div');
  div.className = 'message search-sources library-note';
  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = `${CONTEXT_SOURCES.library} · ${info.files} file${info.files === 1 ? '' : 's'}`;
  div.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'search-sources-queries';
  // The ranker is named because the two pick genuinely different files, and "why did it
  // send that note" is unanswerable without knowing which one ran.
  sub.textContent = `${info.mode} · zones: ${info.zones.join(', ') || 'none'}`
    + (info.ranker ? ` · ranked: ${info.ranker}` : '')
    + (info.why ? ` · ${info.why}` : '')
    + (info.missing ? ` · ${info.missing} missing path(s)` : '');
  div.appendChild(sub);
  messagesEl.appendChild(div);
  return div;
}

// Returns a context string built from the user's local library, or null.
async function buildLibraryContext(userText) {
  if (!libraryEnabled) return null;
  const sources = libParseSources(librarySourcesText);
  if (!sources.length) {
    addMessage('error', 'Local library is on, but no sources are set. Add folders/files in Settings → Library.');
    return null;
  }

  let res;
  try {
    res = await window.api.libraryCollect(sources, LIBRARY_COLLECT_OPTS);
  } catch (err) {
    addMessage('error', `Local library failed to read sources: ${err?.message || err}`);
    return null;
  }

  const files = Array.isArray(res?.files) ? res.files : [];
  const missing = Array.isArray(res?.stats?.missing) ? res.stats.missing : [];
  if (!files.length) {
    addMessage('error', `Local library is on, but no readable text files were found.${missing.length ? ` Missing: ${missing.join(', ')}` : ''}`);
    return null;
  }

  const budget = Math.max(1000, libraryMaxChars);
  let picked;
  let ranker = libraryMode === 'all' ? 'recent' : 'lexical';
  if (libraryMode === 'all' || !userText) {
    picked = libPackAll(files, budget);
  } else {
    const order = await libSemanticOrder(userText, files);
    if (order) { picked = libPackRelevant(files, userText, budget, order); ranker = 'semantic'; }
    else picked = libPackRelevant(files, userText, budget);
    if (!picked.length) {
      picked = libPackAll(files, Math.min(budget, 4000));  // no hit at all → compact recent
      ranker = 'recent';
    }
  }
  if (!picked.length) return null;

  const byZone = new Map();
  for (const p of picked) {
    const z = p.file.zone || 'Library';
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(p);
  }
  const zoneNames = [...byZone.keys()];

  renderLibraryNote({
    files: picked.length, zones: zoneNames, mode: libraryMode, missing: missing.length, ranker,
    why: ranker === 'semantic' ? '' : libSemanticWhy,
  });

  const parts = [
    LIBRARY_FRAMING,
    `\n${contextSourceHeader('library')} — ${picked.length} file${picked.length === 1 ? '' : 's'} (zones: ${zoneNames.join(', ')})${libraryMode === 'all' ? '' : ' · selected as relevant to this message'}`,
  ];
  for (const [zone, items] of byZone) {
    parts.push(`\n## ${zone}`);
    for (const { file, snippet } of items) {
      parts.push(`### ${file.rel || file.name}\n${snippet}`);
    }
  }
  return parts.join('\n');
}

// ── Browser history context layer ─────────────────────────────────────────────────
// One custom profile path per line (a profile folder or a History file). Empty = auto.
function historyParsePaths(text) {
  return String(text || '').split('\n').map(l => l.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

// Re-rank Rust's broad results precisely for the message: query tokens in the title
// weigh more than in the URL; ties break on visit count, then recency.
function historyRankRelevant(items, userText) {
  const q = [...new Set(cmTokens(userText))];
  if (!q.length) return items;
  const scored = items.map(it => {
    const titleToks = new Set(cmTokens(it.title || ''));
    const urlToks = new Set(cmTokens(it.url || ''));
    let s = 0;
    for (const t of q) {
      if (titleToks.has(t)) s += 2;
      else if (urlToks.has(t)) s += 1;
    }
    return { it, s };
  }).filter(x => x.s > 0);
  scored.sort((a, b) =>
    b.s - a.s
    || (b.it.visitCount || 0) - (a.it.visitCount || 0)
    || (b.it.lastVisitMs || 0) - (a.it.lastVisitMs || 0));
  return scored.map(x => x.it);
}

// Local wall-clock, but written unambiguously. toLocaleString() was emitting Finnish
// d.m.yyyy here ("9.8.2026"), which a model reads as either 9 August or 8 September with no
// way to tell — and the app hands these dates to the model, not to a human who knows the
// machine's locale. Local components rather than toISOString(), so the timestamp still
// matches what the user saw in their browser.
function historyStamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function historyFormatEntry(it) {
  const title = (it.title || '').trim() || '(untitled)';
  const meta = [];
  if (it.lastVisitMs) {
    try { meta.push(historyStamp(it.lastVisitMs)); } catch { /* ignore */ }
  }
  if (it.visitCount) meta.push(`${it.visitCount} visit${it.visitCount === 1 ? '' : 's'}`);
  return `- ${title} — ${it.url}${meta.length ? ` [${meta.join(' · ')}]` : ''}`;
}

function renderHistoryNote(info) {
  const div = document.createElement('div');
  div.className = 'message search-sources history-note';
  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = `${CONTEXT_SOURCES.history} · ${info.count} entr${info.count === 1 ? 'y' : 'ies'}`;
  div.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'search-sources-queries';
  sub.textContent = `${info.mode} · last ${info.days} day${info.days === 1 ? '' : 's'}`;
  div.appendChild(sub);
  messagesEl.appendChild(div);
  return div;
}

// Returns a context string built from the user's local browser history, or null.
async function buildHistoryContext(userText) {
  if (!historyEnabled) return null;

  let res;
  try {
    res = await window.api.historySearch({
      query: historyMode === 'relevant' ? (userText || '') : '',
      days: historyDays,
      scanLimit: HISTORY_SCAN_LIMIT,
      includeChrome: historyIncludeChrome,
      profilePaths: historyParsePaths(historyProfilesText),
    });
  } catch (err) {
    addMessage('error', `Browser history failed to read: ${err?.message || err}`);
    return null;
  }

  const items = Array.isArray(res?.items) ? res.items : [];
  const errs = Array.isArray(res?.stats?.missing) ? res.stats.missing : [];
  if (!items.length) {
    addMessage('error', `Browser history is on, but no entries were found.${errs.length ? ` (${errs.join('; ')})` : ''}`);
    return null;
  }

  // The backend returns rows ordered by visit_count DESC, so "most recent" has to re-sort by
  // last visit — otherwise it silently means "most visited", which on real history is
  // dominated by navigation chrome ("New tab", "YouTube", "Parked") and was being handed to
  // the model labelled as what the user had recently been looking at.
  const byRecency = () => items.slice().sort((a, b) => (b.lastVisitMs || 0) - (a.lastVisitMs || 0));

  let picked;
  if (historyMode === 'relevant' && userText) {
    picked = historyRankRelevant(items, userText).slice(0, historyMaxEntries);
    if (!picked.length) picked = byRecency().slice(0, Math.min(historyMaxEntries, 20));  // no lexical hit → recent
  } else {
    picked = byRecency().slice(0, historyMaxEntries);
  }
  if (!picked.length) return null;

  const budget = Math.max(1000, historyMaxChars);
  const lines = [];
  let used = 0;
  for (const it of picked) {
    const line = historyFormatEntry(it);
    if (used + line.length > budget && lines.length) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return null;

  renderHistoryNote({ count: lines.length, mode: historyMode, days: historyDays });

  return [
    HISTORY_FRAMING,
    `\n${contextSourceHeader('history')} — ${lines.length} entr${lines.length === 1 ? 'y' : 'ies'} (last ${historyDays} day${historyDays === 1 ? '' : 's'}${historyMode === 'relevant' && userText ? ', selected as relevant to this message' : ', most recent'})`,
    ...lines,
  ].join('\n');
}

// ── Hermes warm memory context source ─────────────────────────────────────────────
// 'active' is prepended at request time rather than stored, so it is present on every read
// whatever is in localStorage — including a value written by an older build, or one hand-
// edited to drop it. There is no configuration in which this source reads only tiers whose
// material is not current.
function hermesRequestTiers() {
  return ['active', ...hermesTiers.filter(t => t !== 'active')];
}

// Enough YAML for the metadata block the workspace's own template defines: scalars, and
// the one block-list form it uses (`sources:` followed by `  - item`). Not a YAML parser
// and not trying to be — anything it does not recognise is left out rather than guessed
// at, because a mis-parsed date here would put a wrong freshness stamp on a real claim.
function hermesParseFrontMatter(text) {
  const src = String(text || '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { meta: {}, body: src.trim() };
  const meta = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      meta[listKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim().replace(/^["']|["']$/g, '');
    if (!val) { listKey = key; meta[key] = []; continue; }   // `sources:` then indented items
    listKey = null;
    meta[key] = (val === 'null' || val === '~') ? '' : val;
  }
  return { meta, body: src.slice(m[0].length).trim() };
}

const HERMES_DAY_MS = 86400000;

// Whole elapsed days, floored — never rounded. Most stamps here are date-only, which parses
// to midnight, so rounding reports a document written yesterday evening as two days old and
// a review date as falling a day earlier than the calendar says. Flooring makes both read as
// the plain calendar difference, and cannot make a stale document look fresher than it is.
function hermesDaysFromNow(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / HERMES_DAY_MS);
}

// Freshness comes from the document's own stamps, never from the file's mtime — the
// workspace rewrites documents long after the observations they record, so an mtime here
// would date the edit and present it as the observation.
function hermesFreshness(meta) {
  const asOf = String(meta.information_as_of || '').trim();
  const reviewAfter = String(meta.review_after || '').trim();
  const ageDays = asOf ? hermesDaysFromNow(asOf) : null;
  const dueDays = reviewAfter ? hermesDaysFromNow(reviewAfter) : null;
  let state = 'current';
  if (!asOf || ageDays === null) state = 'undated';          // nothing to age it by
  else if (dueDays !== null && dueDays > 0) state = 'review-due';
  return { asOf, reviewAfter, ageDays, dueDays, state };
}

function hermesAgeText(fresh) {
  const parts = [];
  if (fresh.state === 'undated') {
    parts.push('information as of: not stated (this document cannot be aged — treat every claim in it as undated)');
  } else {
    const age = fresh.ageDays === 0 ? 'today'
      : fresh.ageDays === 1 ? '1 day ago'
      : fresh.ageDays > 0 ? `${fresh.ageDays} days ago`
      : 'stamped in the future';
    parts.push(`information as of: ${fresh.asOf} (${age})`);
  }
  if (fresh.reviewAfter) {
    parts.push(fresh.dueDays > 0
      ? `REVIEW DUE — past its review date ${fresh.reviewAfter} by ${fresh.dueDays} day${fresh.dueDays === 1 ? '' : 's'}; stale until revalidated`
      : `review due ${fresh.reviewAfter}${fresh.dueDays === null ? '' : ` (in ${Math.abs(fresh.dueDays)} day${Math.abs(fresh.dueDays) === 1 ? '' : 's'})`}`);
  }
  return parts.join(' · ');
}

// Normalise one document as Rust handed it over: front matter split off, title and section
// headings pulled out, freshness resolved. Everything downstream works on this shape.
function hermesReadDoc(raw) {
  const { meta, body } = hermesParseFrontMatter(raw?.text || '');
  const h1 = /^#\s+(.+)$/m.exec(body);
  const headings = (body.match(/^##\s+(.+)$/gm) || [])
    .map(h => h.replace(/^##\s+/, '').trim()).slice(0, 8);
  return {
    ...raw,
    meta,
    // The H1 is dropped from the body because the title already leads the document header.
    // Left in, it scores as a block like any other and is usually the top-ranked one, so
    // the excerpt opens by repeating the heading two lines above it.
    body: h1 ? body.slice(h1.index + h1[0].length).trim() : body,
    headings,
    title: (h1 ? h1[1].trim() : String(raw?.name || 'document').replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]/g, ' ')),
    fresh: hermesFreshness(meta),
  };
}

// ACTIVE.md is the workspace's own short cache of what is current, and being listed in it
// is provenance a directory listing cannot give: a document can sit in active/ after its
// entry was removed. Bullets look like `- **Title** — blurb` followed by a backticked path.
function hermesParseIndex(indexText) {
  const byPath = new Map();
  for (const chunk of String(indexText || '').split(/\n-\s+/).slice(1)) {
    const path = /`([^`]+\.(?:md|markdown|txt))`/.exec(chunk);
    if (!path) continue;
    const title = /\*\*(.+?)\*\*/.exec(chunk);
    const blurb = chunk
      .replace(/`[^`]*`/g, '')
      .replace(/\*\*/g, '')
      .split(/\s+—\s+/).slice(1).join(' — ')
      .replace(/\s+/g, ' ')
      .trim();
    byPath.set(path[1].toLowerCase().replace(/\\/g, '/'), { title: title ? title[1].trim() : '', blurb });
  }
  return byPath;
}

// IDF over the retrieved set, the same shape libPackRelevant uses, with the title and
// section headings weighted up: a Hermes document is a topic, so its title is a much
// stronger signal of what it is about than a word buried in its evidence section.
//
// The matched-token floor is the same rule `concept_search` needs and for the same reason,
// measured again here: "how do I re-tension a bicycle chain" retrieved the UI-shock
// assessment, because that document happens to use the word "chain". A whole document is a
// far bigger surface than a concept label, so a single common word will nearly always land
// somewhere in one — and the result is a dated assessment of something else presented as
// relevant to the question. Below three tokens there is nothing else to go on, so the
// single-token rule stands there.
function hermesRankDocs(docs, userText) {
  const q = [...new Set(cmTokens(userText))];
  if (!q.length) return docs.map(d => ({ doc: d, score: 0 }));
  const minMatched = q.length >= 3 ? 2 : 1;
  const df = new Map();
  const docToks = docs.map(d => {
    const toks = new Set(cmTokens(`${d.title} ${d.headings.join(' ')} ${d.body}`));
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
    return toks;
  });
  const total = docs.length || 1;
  const idf = (t) => Math.log((total + 1) / ((df.get(t) || 0) + 1)) + 1;
  return docs.map((d, i) => {
    const head = new Set(cmTokens(`${d.title} ${d.headings.join(' ')}`));
    let score = 0;
    let hits = 0;
    for (const t of q) {
      if (!docToks[i].has(t)) continue;
      score += idf(t) * (head.has(t) ? 3 : 1);
      hits += 1;
    }
    return { doc: d, score: hits >= minMatched ? score : 0, idf, q };
  }).sort((a, b) => b.score - a.score);
}

// The metadata block that travels with every document, excerpted or not. The tier standing
// leads because it governs how everything under it may be used; provenance and freshness
// follow. A document that says it was superseded is not current whatever tier it sits in,
// so that overrides the tier's own wording.
function hermesDocHeader(doc, indexed) {
  const superseded = String(doc.meta.superseded_by || '').trim();
  const status = String(doc.meta.status || '').trim();
  const standing = superseded
    ? `SUPERSEDED by ${superseded} — historical`
    : (HERMES_TIER_STANDING[doc.tier] || 'unknown standing — do not treat as current');
  const lines = [`### [${doc.tier} · ${standing}] ${doc.title}`];
  lines.push(`- document: ${doc.rel}${status ? ` · status: ${status}` : ''}${indexed ? ' · listed in ACTIVE.md as a current topic' : ''}`);
  lines.push(`- ${hermesAgeText(doc.fresh)}`);
  const sources = Array.isArray(doc.meta.sources) ? doc.meta.sources.filter(Boolean) : [];
  if (sources.length) lines.push(`- what it was built from: ${sources.join(' · ')}`);
  if (doc.headings.length) lines.push(`- sections: ${doc.headings.join(' · ')}`);
  if (doc.truncated) lines.push(`- note: this document was read only up to ${HERMES_COLLECT_OPTS.maxFileChars} characters`);
  return lines.join('\n');
}

// Restates the standing AFTER the excerpt, for the two kinds of document whose content
// would otherwise read as a plain statement of fact. Measured 2026-08-09 with a stand-in
// weak model: given a parked survey correctly headed "HISTORICAL until revalidated", it
// answered "Node version: Node 18 · CI vendor: GitHub Actions" as a headline and put the
// caveat underneath — the header was read, then out-weighed by the prose beneath it. A
// small model attends to what it read last, so the standing has to be on both sides of the
// content, not only above it. Current, in-review documents get no footer: qualifying
// everything equally is how a caveat stops meaning anything.
function hermesExcerptFooter(doc) {
  const superseded = String(doc.meta.superseded_by || '').trim();
  const when = doc.fresh.state === 'undated'
    ? 'at an unstated time'
    : `${doc.fresh.ageDays} day${doc.fresh.ageDays === 1 ? '' : 's'} ago`;
  if (superseded || doc.tier !== 'active') {
    return `\n\n— end of ${superseded ? 'superseded' : doc.tier} material, recorded ${when}.`
      + ` The above is what was true then. Do not answer with it as the current situation;`
      + ` if it is all you have on the subject, say that this is a ${when} record and that`
      + ` nothing current confirms it.`;
  }
  if (doc.fresh.state === 'review-due') {
    return `\n\n— end of excerpt from a document past its review date (recorded ${when}).`
      + ` It has not been revalidated since, so state it as what was observed then, not as`
      + ` what is the case now.`;
  }
  return '';
}

function renderHermesNote(info) {
  const div = document.createElement('div');
  div.className = 'message search-sources hermes-note';
  const title = document.createElement('div');
  title.className = 'search-sources-title';
  title.textContent = `${CONTEXT_SOURCES.hermes} · ${info.excerpted} topic${info.excerpted === 1 ? '' : 's'}`;
  div.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'search-sources-queries';
  const bits = [info.tiers.map(([t, n]) => `${t} ${n}`).join(' · ') || 'nothing matched'];
  if (info.listed) bits.push(`${info.listed} listed by title only`);
  if (info.reviewDue) bits.push(`${info.reviewDue} past review date`);
  if (info.undated) bits.push(`${info.undated} undated`);
  if (info.historical) bits.push(`${info.historical} historical/untriaged`);
  sub.textContent = bits.join(' · ');
  div.appendChild(sub);
  messagesEl.appendChild(div);
  return div;
}

// Returns a context string built from the Hermes warm-memory workspace, or null.
async function buildHermesContext(userText) {
  if (!hermesEnabled) return null;

  let res;
  try {
    res = await window.api.hermesCollect({
      root: hermesRoot,
      tiers: hermesRequestTiers(),
      ...HERMES_COLLECT_OPTS,
    });
  } catch (err) {
    addMessage('error', `${CONTEXT_SOURCES.hermes} failed to read the workspace: ${err?.message || err}`);
    return null;
  }

  const docs = (Array.isArray(res?.docs) ? res.docs : []).map(hermesReadDoc);
  const issues = Array.isArray(res?.stats?.missing) ? res.stats.missing : [];
  if (!docs.length) {
    addMessage('error', `${CONTEXT_SOURCES.hermes} is on, but no topic documents were found in ${res?.root || 'the workspace'}.${issues.length ? ` (${issues.join('; ')})` : ''}`);
    return null;
  }
  const index = hermesParseIndex(res?.indexText);
  const isIndexed = (doc) => index.has(String(doc.rel || '').toLowerCase());

  const ranked = hermesRankDocs(docs, userText || '');
  // Only documents that actually matched the message are excerpted, and that is where the
  // tier rule bites: a parked, archived or inbox document can reach this list solely by
  // matching what was asked. Nothing outside active/ is ever carried in by a fallback, used
  // to pad a thin result, or listed for orientation the way current topics are below — an
  // unmatched historical document is dropped, not shown with a caveat.
  const excerptable = ranked.filter(r => r.score > 0).slice(0, Math.max(1, hermesMaxTopics));

  const budget = Math.max(1000, hermesMaxChars);
  const blocks = [];
  const shown = [];
  let used = 0;
  const perDoc = Math.max(600, Math.floor((budget * 0.8) / Math.max(1, excerptable.length)));
  for (const { doc, idf, q } of excerptable) {
    if (used >= budget) break;
    const header = hermesDocHeader(doc, isIndexed(doc));
    const cap = Math.min(perDoc, budget - used - header.length);
    if (cap < 200) break;
    const snippet = libBestBlocks(doc.body, new Set(q), idf, cap);
    if (!snippet) continue;
    blocks.push(`${header}\n- excerpt:\n\n${snippet}${hermesExcerptFooter(doc)}`);
    shown.push(doc);
    used += header.length + snippet.length;
  }

  // Everything current that was not excerpted, as one line each. Titles and dates only —
  // enough that the model knows what the workspace does and does not cover, without
  // handing it content for a question that did not ask for it.
  const excerptedPaths = new Set(shown.map(d => d.rel));
  const listings = [];
  for (const d of ranked.map(r => r.doc)) {
    if (listings.length >= 12 || used >= budget) break;
    if (d.tier !== 'active' || excerptedPaths.has(d.rel)) continue;
    const line = `- ${d.title} (${d.rel}) — ${hermesAgeText(d.fresh)}${isIndexed(d) ? ' · listed in ACTIVE.md' : ''}`;
    listings.push(line);
    used += line.length;   // titles are cheap, but a large workspace makes them add up
  }

  if (!blocks.length && !listings.length) return null;

  const tierCounts = new Map();
  for (const doc of shown) tierCounts.set(doc.tier, (tierCounts.get(doc.tier) || 0) + 1);
  renderHermesNote({
    excerpted: blocks.length,
    listed: listings.length,
    tiers: [...tierCounts.entries()],
    reviewDue: shown.filter(d => d.fresh.state === 'review-due').length,
    undated: shown.filter(d => d.fresh.state === 'undated').length,
    historical: shown.filter(d => d.tier !== 'active' || d.meta.superseded_by).length,
  });

  const scope = `searched: ${hermesRequestTiers().join(', ')} in ${res.root}`;
  const parts = [HERMES_FRAMING];
  parts.push(`\n${contextSourceHeader('hermes')} — ${blocks.length} topic${blocks.length === 1 ? '' : 's'} retrieved for this message (${scope})`);
  parts.push(...blocks);
  if (listings.length) {
    parts.push(blocks.length
      ? `\n#### Other current topics in the workspace (titles only — no excerpt was retrieved for this message)`
      : `\n#### Current topics in the workspace (titles only)\n\nNothing in the workspace matched this message. These are listed so you know what it covers — do not connect your answer to them, and do not treat this list as an answer to anything.`);
    parts.push(...listings);
  }
  if (issues.length) parts.push(`\n(Retrieval notes: ${issues.join('; ')}.)`);
  return parts.join('\n');
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
  if (webSearchMode !== 'off' && text) {
    webSearchContext = await runWebSearch(text, webSearchMode);
  }

  // Concept map. In overview mode the map is a one-time priming of the chat: the first send
  // with the toggle on renders it in full and freezes it, and every send after that gets
  // only a small slice of entries relevant to that message. Once primed the map stays in
  // the request for the rest of the chat whatever the toggle does — it is already part of
  // what the model has seen, and removing it would invalidate the cached prefix for nothing.
  // Relevant mode keeps the older behaviour: no prime, a fresh relevant selection each turn.
  // On-demand mode injects nothing here at all — streamAssistantResponse attaches
  // concept_search instead and the model pulls what it wants through the tool loop.
  let conceptMapContext = null;
  if (conceptMapEnabled && text && conceptMapMode !== 'ondemand') {
    if (conceptMapMode === 'relevant') {
      conceptMapContext = await buildConceptMapSlice(text, { standalone: true });
    } else if (!primedConceptMap || primedConceptMapSig !== cmPrimeSignature()) {
      primedConceptMap = await buildConceptMapPrime();  // full map, then frozen for this chat
      // Signature taken AFTER the build, not before: an auto-resolved path is only known
      // once cmResolvePath has run, and a signature captured beforehand would miss it and
      // force a needless re-prime on the very next message.
      primedConceptMapSig = primedConceptMap ? cmPrimeSignature() : '';
    } else {
      conceptMapContext = await buildConceptMapSlice(text);
    }
  }

  let libraryContext = null;
  if (libraryEnabled) {
    libraryContext = await buildLibraryContext(text);
  }

  // Hermes warm memory is only ever read because the user turned it on for this message —
  // there is no auto-enable, and no path that reads that workspace with the toggle off.
  let hermesContext = null;
  if (hermesEnabled) {
    hermesContext = await buildHermesContext(text);
  }

  let historyContext = null;
  if (historyEnabled) {
    historyContext = await buildHistoryContext(text);
  }

  await streamAssistantResponse({
    forceImageDescriptionsForLastUser: shouldAnalyzeOutgoingImages,
    webSearchContext,
    conceptMapContext,
    libraryContext,
    hermesContext,
    historyContext,
  });
}

// Appended to an answer that was cut short, so the transcript does not present a truncated
// reply as a finished one. It goes in the message content rather than in a metadata field
// on purpose: the .txt transcript is the format that survives a corrupt .json sidecar, and
// it carries nothing but role and text — a flag stored beside the content would silently
// disappear on exactly the reload where knowing this matters. It is also the honest thing
// for the model to read on the next turn.
const INTERRUPTED_SUFFIX = '\n\n_[Response interrupted — the text above is partial.]_';

async function streamAssistantResponse({ forceImageDescriptionsForLastUser = false, webSearchContext = null, conceptMapContext = null, libraryContext = null, hermesContext = null, historyContext = null } = {}) {
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
  let lastRenderAt = 0;
  let partialPersisted = false;
  const priorRoundTexts = [];

  function finishStreaming() {
    if (finalized) return;
    finalized = true;
    window.clearTimeout(generation.stopTimer);
    thinkingIndicator?.remove();
    document.body.classList.remove('streaming');
    sendBtn.textContent = 'Send';
    if (activeGeneration === generation) activeGeneration = null;
  }

  // Text that already streamed is real output whatever ended the stream, so every
  // interrupted path saves it. Both used to lose it in different ways: the error path
  // deleted the bubble outright, discarding minutes of visible text on a stall or a dropped
  // connection; and Stop left the text on screen but never put it in conversationHistory,
  // so the transcript on disk, the array the next request is built from, and the message
  // indices the DOM is keyed by all disagreed with what the user could see — until a reload
  // resolved it by dropping the answer.
  //
  // Idempotent: Stop can reach this through finalizeStop and through the loop's early
  // return, and on an error the stream can end while a stop is already pending.
  async function persistPartialAnswer(status) {
    if (partialPersisted) return;
    const text = [...priorRoundTexts, streamedText].filter(t => t.trim()).join('\n\n');
    if (!text.trim()) return;
    partialPersisted = true;
    const marked = `${text}${INTERRUPTED_SUFFIX}`;
    if (assistantDiv) {
      assistantDiv.innerHTML = renderMarkdown(marked);
    } else {
      assistantDiv = addMessage('assistant', marked);
    }
    conversationHistory.push({ role: 'assistant', content: marked });
    currentChat.messages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
    await saveCurrentChat();
    // The error branch records its own meta entry, with the server's message attached, so
    // only the cancelled paths need one from here — otherwise one exchange leaves two.
    if (status === 'cancelled') await recordMeta('cancelled', '', 0);
    updateContextBar();
    markLatestUnanswered();
  }

  generation.finalizeStop = () => {
    generation.stopped = true;
    finishStreaming();
    if (!streamedText && assistantDiv) assistantDiv.remove();
    // Not awaited — this runs from a click handler and a timer, neither of which can wait.
    persistPartialAnswer('cancelled').catch(err => console.error('Failed to save the partial reply:', err));
    markLatestUnanswered();
  };

  // Each call re-parses the whole response so far (marked has no incremental/streaming
  // API), so cost grows with response length for the life of the stream. rAF already
  // caps this at one render per display frame no matter how fast chunks arrive; this
  // adds a time floor on top so a long generation doesn't spend the full session
  // re-parsing+re-rendering an ever-growing string up to 60 times a second.
  const STREAM_RENDER_MIN_INTERVAL_MS = 80;

  function renderStreamedMarkdown() {
    // finalized also gates this: a throttle-deferred rAF (below) can still be pending
    // when the stream finishes and does its own final synchronous render, and without
    // this check that stale callback would fire a frame later and redundantly replace
    // assistantDiv's contents again (wasted work, and it would clear any in-progress
    // text selection in that message).
    if (!assistantDiv || generation.stopped || finalized) {
      rafPending = false;
      return;
    }
    const now = performance.now();
    if (now - lastRenderAt < STREAM_RENDER_MIN_INTERVAL_MS) {
      requestAnimationFrame(renderStreamedMarkdown);
      return;
    }
    rafPending = false;
    lastRenderAt = now;
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
    cancelScope: 'chat',
  };

  // On-demand concept map: attach concept_search and let the model pull what it needs.
  const conceptTools = await cmToolsForRequest();
  if (conceptTools) {
    options.tools = conceptTools;
    // Measured on gemma-4-26b-a4b: with thinking on, reasoning spends the entire max_tokens
    // budget and the reply arrives empty with finish_reason "length" and no tool call at all.
    // The failure is silent — the model simply never calls — so reasoning is forced off for
    // the whole exchange rather than just the first round, since every round can call.
    if (options.reasoningRequested) {
      options.reasoningRequested = false;
      if (!cmToolReasoningNoticed) {
        cmToolReasoningNoticed = true;
        addMessage('system', 'Reasoning is off for this chat: the concept map is set to "On demand", and with thinking on the model spends its whole token budget reasoning and never issues the search. Switch the map to "Prime once" or "Relevant only" in Settings to use reasoning.');
      }
    }
  }
  const reasoningSent = options.reasoningRequested;
  const requestHadImages = conversationHistory.some(messageHasImages);
  const apiMessages = buildApiMessagesForModel(conversationHistory, currentModel, { forceImageDescriptionsForLastUser });
  // Inject extra context as system messages just before the last user turn. Order:
  // concept-map memory (long-term background), then the user's local library (curated
  // source material), then Hermes warm memory (another agent's notes — dated, and never
  // authoritative about now), then their browser history (recent activity), then web
  // results (external/current), then the user turn. Hermes sits after the library and
  // before the live-ish sources deliberately: it is second-hand and time-stamped, so it
  // should not be the last thing read before the question.
  // Per-message context sources go next to the newest user turn, where being adjacent to the
  // question is the point: they are about this message.
  const contextSources = [conceptMapContext, libraryContext, hermesContext, historyContext, webSearchContext].filter(Boolean);
  if (contextSources.length) {
    let lastUserIdx = -1;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === 'user') { lastUserIdx = i; break; }
    }
    const insertAt = lastUserIdx >= 0 ? lastUserIdx : apiMessages.length;
    apiMessages.splice(insertAt, 0, ...contextSources.map(content => ({ role: 'system', content })));
  }

  // Front matter goes at the head of the array — index 0 here, index 1 once the backend
  // prepends the system prompt. Two reasons it belongs there rather than beside the user
  // turn: it is identical on every request, so the whole block stays a reusable prompt
  // prefix instead of forcing the server to re-read the map each message; and the map stops
  // occupying the slot immediately before the question, which is where it had the most pull
  // on how answers were worded. The preamble leads so it governs everything after it.
  // The tool variant is truthful only when a tool is actually attached, so it is picked from
  // options.tools rather than from the mode — a chat where the map resolves to nothing gets
  // the plain "you have no tools" text, which is then still exactly right.
  const frontMatter = [options.tools ? CONTEXT_SOURCES_PREAMBLE_TOOL : CONTEXT_SOURCES_PREAMBLE];
  if (primedConceptMap) frontMatter.push(primedConceptMap);
  apiMessages.unshift(...frontMatter.map(content => ({ role: 'system', content })));

  let promptExtraTokens = [...frontMatter, ...contextSources]
    .reduce((n, c) => n + estimateTokens(c) + 4, 0);
  if (options.tools) promptExtraTokens += estimateTokens(JSON.stringify(options.tools)) + 4;
  lastContextSourceTokens = promptExtraTokens;
  updateContextBar();  // context sources dominate the real prompt; show it as soon as it's known
  const requestSentActualImages = apiMessages.some(messageHasImages);

  function handleChunk(chunk) {
    if (generation.stopped) return;
    if (!assistantDiv) {
      thinkingIndicator?.remove();
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

  // Tool loop. Without concept_search attached this runs exactly once and breaks on the first
  // result, which is every mode but on-demand. With it attached the model may answer straight
  // away or ask for a search first; each round gets its own message bubble so the search note
  // lands between them in the transcript rather than above text that arrived after it.
  let result;
  let toolRounds = 0;
  const toolState = cmNewToolState();

  for (;;) {
    result = await window.api.sendMessage(apiMessages, options, handleChunk);
    // Stop was pressed. finalizeStop has already saved whatever streamed; this call is the
    // idempotent second chance for the case where the stream returned before the timer or
    // the cancel round-trip did.
    if (generation.stopped) { await persistPartialAnswer('cancelled'); return; }
    if (result?.error || result?.cancelled) break;

    const calls = (Array.isArray(result.toolCalls) ? result.toolCalls : [])
      .filter(c => c?.function?.name);
    // No call, or a call arriving after the tool was withdrawn (nothing left to feed it) —
    // either way this round's text is the answer.
    if (!calls.length || !options.tools) break;

    // Close this round's bubble, and take the spinner down, before the search notes are
    // appended — both are at the end of the message list, so anything still standing would
    // end up above a note describing something that happened after it.
    if (streamedText.trim() && assistantDiv) {
      assistantDiv.innerHTML = renderMarkdown(streamedText);
      priorRoundTexts.push(streamedText);
    } else if (assistantDiv) {
      assistantDiv.remove();
    }
    streamedText = '';
    assistantDiv = null;
    thinkingIndicator?.remove();
    thinkingIndicator = null;

    apiMessages.push({ role: 'assistant', content: result.content || '', tool_calls: calls });
    for (const call of calls) {
      const output = await cmExecuteToolCall(call, toolState);   // renders its own note itself
      const content = JSON.stringify(output);
      promptExtraTokens += estimateTokens(content) + 4;
      apiMessages.push({
        role: 'tool',
        tool_call_id: call.id || '',
        name: call.function.name,
        content,
      });
    }
    if (generation.stopped) { await persistPartialAnswer('cancelled'); return; }

    toolRounds += 1;
    // Withdraw the tool once the cap is reached so the next round has to be an answer —
    // the server keeps returning tool_calls for as long as tools are offered.
    if (toolRounds >= CM_TOOL_MAX_ROUNDS) delete options.tools;

    lastContextSourceTokens = promptExtraTokens;
    updateContextBar();
    thinkingIndicator = createThinkingIndicator();
  }

  finishStreaming();
  if (result?.reasoningFallback) {
    addMessage('system', 'Reasoning controls were rejected by this server/model, so the chat request was retried without them.');
  }

  if (result?.error) {
    // Keep whatever arrived before the failure. A stall or a dropped connection partway
    // through a long answer used to delete the entire visible reply and leave only an
    // error, which is the worst possible trade: the text was already generated, already
    // paid for, and already read.
    const hadPartial = [...priorRoundTexts, streamedText].some(t => t.trim());
    if (hadPartial) {
      await persistPartialAnswer('error');
    } else if (assistantDiv) {
      assistantDiv.remove();
    }
    const imageHint = requestSentActualImages
      ? '\n\nIf this came from image input, set this model to text-only in Settings > Models or switch to a vision-capable model.'
      : '';
    addMessage('error', `Error: ${result.error}${imageHint}`);
    await recordMeta('error', result.error, 0);
  } else if (result?.cancelled) {
    if (!streamedText && assistantDiv) assistantDiv.remove();
    else await persistPartialAnswer('cancelled');
  } else {
    // A completed response means LM Studio has this model loaded — record it so we
    // don't redundantly reload it later.
    loadedModel = options.model || currentModel || loadedModel;
    // Only this round goes into this round's bubble; earlier rounds already have theirs, and
    // re-rendering the joined text here would duplicate them on screen.
    const roundText = streamedText || result?.content || '';
    if (assistantDiv) {
      assistantDiv.innerHTML = renderMarkdown(roundText);
    } else if (roundText) {
      assistantDiv = addMessage('assistant', roundText);
    }
    const finalText = [...priorRoundTexts, roundText].filter(t => t.trim()).join('\n\n');
    // An empty reply with reasoning on and a token cap set is almost always the cap being
    // spent entirely on thinking: measured on gemma-4-26b-a4b, a 500-token cap went 500/500
    // to reasoning and returned no content at all. Silent by nature — the model does not
    // report it and the reply just arrives blank — so say what happened. Keyed to what was
    // actually sent, not to the setting: on-demand mode forces reasoning off, and blaming
    // thinking for an empty reply there would send the user after the wrong thing.
    if (!finalText.trim() && reasoningSent && currentMaxTokens > 0) {
      addMessage('system', `The reply came back empty. Reasoning is on and max tokens is capped at ${currentMaxTokens.toLocaleString()}, and thinking is drawn from that same budget — it can consume all of it before any answer is written. Raise or clear the cap in Settings, or turn reasoning off.`);
    } else if (!finalText.trim() && toolRounds > 0) {
      addMessage('system', `The concept map was searched ${toolRounds === 1 ? 'once' : `${toolRounds} times`}, but no answer followed. The token budget may be going on the searches — raise or clear the max-tokens cap in Settings, or switch the concept map out of "On demand".`);
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
    // Scoped to 'chat': an unscoped cancel also killed whatever Data Analysis had in
    // flight, which the user has no reason to connect to pressing Stop in the composer.
    window.api.cancelMessage('chat')
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
const DEV_LOGS_MAX_ENTRIES = 500;
let devLogs = [];

window.api.onDevLog((entry) => {
  // Capped: every dev:log event (which can carry full request payloads, including
  // base64 image data for vision requests) was previously retained forever, whether or
  // not the Developer Console was ever opened.
  devLogs.push(entry);
  if (devLogs.length > DEV_LOGS_MAX_ENTRIES) devLogs.splice(0, devLogs.length - DEV_LOGS_MAX_ENTRIES);
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
    // entry.* values come from the LLM server's responses (e.g. error text), so they
    // need the same escaping as any other server/model-controlled string before innerHTML.
    row.innerHTML = `<span class="dev-log-detail-key">${escapeHtml(key)}</span><span class="dev-log-detail-val">${escapeHtml(val)}</span>`;
    details.appendChild(row);
  }

  if (entry.messages && Array.isArray(entry.messages)) {
    const row = document.createElement('div');
    row.className = 'dev-log-detail-row';
    row.innerHTML = `<span class="dev-log-detail-key">request</span><span class="dev-log-detail-val">${escapeHtml(JSON.stringify(entry.messages, null, 2).slice(0, 800))}</span>`;
    details.appendChild(row);
  }

  header.addEventListener('click', () => {
    logEl.classList.toggle('expanded');
  });

  logEl.appendChild(header);
  logEl.appendChild(details);
  devConsoleLogs.appendChild(logEl);
  while (devConsoleLogs.children.length > DEV_LOGS_MAX_ENTRIES) {
    devConsoleLogs.removeChild(devConsoleLogs.firstElementChild);
  }
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
  // The token is persisted by the backend and applied to every server request there;
  // load it into the settings field for display/editing.
  try {
    const savedToken = await window.api.getApiToken();
    if (settingsApiToken) settingsApiToken.value = savedToken || '';
  } catch {}
  await initExaApiKey();
  // Before the first send, so a message never goes out with the library/map/history/Hermes
  // settings of an origin that has simply never been configured.
  await initMachinePaths();

  await loadModels();
  await loadChats();
  startNewChat();

  // Periodic server status check every 30s
  setInterval(checkServerStatus, 30000);
}

init();
