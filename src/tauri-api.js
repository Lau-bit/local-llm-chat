(function () {
  const tauri = window.__TAURI__;
  const invoke = tauri && tauri.core && tauri.core.invoke;
  const Channel = tauri && tauri.core && tauri.core.Channel;
  const listen = tauri && tauri.event && tauri.event.listen;

  if (!invoke || !listen) {
    console.error('Tauri API is not available.');
    return;
  }

  function onEvent(name, callback) {
    let disposed = false;
    let unlistenFn = null;
    const ready = listen(name, (event) => callback(event.payload))
      .then((unlisten) => {
        unlistenFn = unlisten;
        if (disposed) unlistenFn();
      })
      .catch((err) => {
        console.error(`Failed to listen for ${name}:`, err);
        throw err;
      });

    const remove = () => {
      disposed = true;
      if (unlistenFn) unlistenFn();
    };
    remove.ready = ready;
    return remove;
  }

  function streamInvoke(command, messages, options, onChunk) {
    if (!Channel) {
      return Promise.resolve({ error: 'Tauri streaming channel is not available.' });
    }
    const args = { messages, options };
    args.streamChannel = new Channel(typeof onChunk === 'function' ? onChunk : () => {});
    return invoke(command, args);
  }

  window.api = {
    sendMessage: (messages, options, onChunk) => streamInvoke('chat_send', messages, options, onChunk),
    analyzeImage: (messages, options, onChunk) => streamInvoke('chat_analyze_image', messages, options, onChunk),
    cancelMessage: () => invoke('chat_cancel'),

    getModels: (serverUrl) => invoke('get_models', { serverUrl }),
    loadModel: (model) => invoke('load_model', { model }),
    exaSearch: (query, options) => invoke('exa_search', { query, options }),
    getServerUrl: () => invoke('get_server_url'),
    setServerUrl: (url) => invoke('set_server_url', { url }),

    saveChat: (chat, baseCount) => invoke('chat_save', { chat, baseCount }),
    listChats: () => invoke('chat_list'),
    loadChat: (chatId) => invoke('chat_load', { chatId }),
    deleteChat: (chatId) => invoke('chat_delete', { chatId }),
    renameChat: (chatId, newTitle) => invoke('chat_rename', { chatId, newTitle }),
    makePrivate: (chatId) => invoke('chat_make_private', { chatId }),
    listPrivateChats: () => invoke('chat_list_private'),
    unhideChat: (chatId) => invoke('chat_unhide', { chatId }),
    listBranchSiblings: (groupId) => invoke('chat_list_branch_siblings', { groupId }),
    setBranchGroup: (chatId, groupId) => invoke('chat_set_branch_group', { chatId, groupId }),

    recordChatMeta: (entry) => invoke('chat_meta_record', { entry }),
    loadChatMeta: (chatId) => invoke('chat_meta_load', { chatId }),

    analysisImport: (sourcePath) => invoke('analysis_import', { sourcePath }),
    analysisList: () => invoke('analysis_list'),
    analysisBuildChunks: (datasetId, targetChars) => invoke('analysis_build_chunks', { datasetId, targetChars }),
    analysisCreateRun: (datasetId, settings) => invoke('analysis_create_run', { datasetId, settings }),
    analysisListRuns: (datasetId) => invoke('analysis_list_runs', { datasetId }),
    analysisRunState: (datasetId, runId) => invoke('analysis_run_state', { datasetId, runId }),
    analysisSaveTopicResult: (datasetId, runId, result) => invoke('analysis_save_topic_result', { datasetId, runId, result }),
    analysisSaveError: (datasetId, runId, error) => invoke('analysis_save_error', { datasetId, runId, error }),
    analysisLoadTopicResults: (datasetId, runId) => invoke('analysis_load_topic_results', { datasetId, runId }),
    analysisSaveCanonBatch: (datasetId, runId, batchId, graph) => invoke('analysis_save_canon_batch', { datasetId, runId, batchId, graph }),
    analysisListCanonBatches: (datasetId, runId) => invoke('analysis_list_canon_batches', { datasetId, runId }),
    analysisSaveGraph: (datasetId, runId, graph) => invoke('analysis_save_graph', { datasetId, runId, graph }),
    analysisAppendLog: (datasetId, runId, logKind, line) => invoke('analysis_append_log', { datasetId, runId, logKind, line }),
    analysisPaths: (datasetId, runId) => invoke('analysis_paths', { datasetId, runId }),
    analysisOpenPath: (path) => invoke('analysis_open_path', { path }),
    analysisResetTopics: (datasetId, runId) => invoke('analysis_reset_topics', { datasetId, runId }),
    analysisResetCanonization: (datasetId, runId) => invoke('analysis_reset_canonization', { datasetId, runId }),

    openExternal: (url) => invoke('shell_open_external', { url }),
    onDevLog: (callback) => onEvent('dev:log', callback),

    windowMinimize: () => invoke('window_minimize'),
    windowToggleMaximize: () => invoke('window_toggle_maximize'),
    windowClose: () => invoke('window_close'),
    windowStartDrag: () => invoke('window_start_drag'),
  };
})();
