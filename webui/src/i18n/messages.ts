export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja';
export type LocaleMode = 'system' | Locale;

export interface Messages {
    common: {
        loading: string;
        refresh: string;
        refreshing: string;
        reset: string;
        clear: string;
        delete: string;
        add: string;
        copy: string;
        copied: string;
        copyFailed: string;
        generate: string;
        generating: string;
        none: string;
        empty: string;
    };
    toolbar: {
        title: string;
        transport: string;
        http: string;
        ws: string;
        refreshMethods: string;
        refreshMethodsLoading: string;
        generateDocs: string;
        generateDocsLoading: string;
        generateDocsTitle: string;
        theme: string;
        themeSystem: string;
        themeLight: string;
        themeDark: string;
        language: string;
        languageSystem: string;
        languageEn: string;
        languageZhCN: string;
        languageZhTW: string;
        languageJa: string;
    };
    sidebar: {
        methods: string;
        metrics: string;
        search: string;
        searchPlaceholder: string;
        matchCount: string; // "匹配 {matched} / {total} 个方法"
        noMatch: string;
        noMethods: string;
    };
    view: {
        label: string;
        methods: string;
        metrics: string;
    };
    method: {
        selectHint: string;
        loading: string;
        loadFailed: string;
        help: string;
        noHelp: string;
        returnType: string;
        returnTypeHint: string;
        none: string;
    };
    test: {
        params: string;
        paramsHint: string; // "（{count} 个，按签名自动生成）"
        noParams: string;
        execute: string;
        executing: string;
        executeStream: string;
        receiving: string;
        resetToSample: string;
        clearOutput: string;
        result: string;
        resultStream: string;
        notExecuted: string;
        copyCurl: string;
        copyCurlCmd: string;
        copyFetch: string;
        copyTitle: string;
        copyDisabledTitle: string;
        chooseFormat: string;
        streamEnded: string; // "（流已结束，共 {count} 帧，总耗时 {duration}）"
        streamEndedEmpty: string; // "（流已结束，无数据，总耗时 {duration}）"
        elapsed: string;
        firstFrame: string;
        jsonError: string;
    };
    schema: {
        nullable: string;
        setNull: string;
        fillValue: string;
        fixedValue: string;
        unionNoBranch: string;
        arrayNoItem: string;
        recordNoValue: string;
        recordAddPlaceholder: string;
        addRecordKey: string;
        addItem: string;
        strictHint: string;
        paramIndex: string; // "参数 [{index}]"
        items: string;
        values: string;
        optionIndex: string; // "option[{index}]"
        inner: string;
    };
    metrics: {
        title: string;
        unavailable: string; // 含 {code}
        autoRefresh: string;
        interval: string;
        refreshNow: string;
        refreshing: string;
        uptime: string;
        loading: string;
        methods: string;
        calls: string;
        streams: string;
        errors: string;
        errorRate: string;
        invalidRequests: string;
        nonStreamTitle: string;
        streamTitle: string;
        noData: string;
        noStreams: string;
        countHint: string;
        // 列名
        colMethod: string;
        colCalls: string;
        colRate: string;
        colErrors: string;
        colErrPct: string;
        colP50: string;
        colP95: string;
        colP99: string;
        colAvg: string;
        colOpened: string;
        colCompleted: string;
        colFailed: string;
        colAborted: string;
        colCompletePct: string;
        colAbortPct: string;
        colAvgChunks: string;
        colTtfbP50: string;
        colTtfbP95: string;
        colDurationAvg: string;
    };
    footer: {
        version: string;
        npm: string;
        github: string;
    };
    alerts: {
        emptyMethods: string;
        docsFailed: string; // 含 {error}
    };
}

export const en: Messages = {
    common: {
        loading: 'Loading…',
        refresh: 'Refresh',
        refreshing: 'Refreshing…',
        reset: 'Reset',
        clear: 'Clear',
        delete: 'Delete',
        add: 'Add',
        copy: 'Copy',
        copied: 'Copied ✓',
        copyFailed: 'Copy failed: {error}',
        generate: 'Generate',
        generating: 'Generating…',
        none: 'None',
        empty: 'Empty',
    },
    toolbar: {
        title: 'JSON-RPC 2.0',
        transport: 'Transport',
        http: 'HTTP',
        ws: 'WebSocket',
        refreshMethods: 'Refresh methods',
        refreshMethodsLoading: 'Refreshing…',
        generateDocs: 'Generate docs ⬇',
        generateDocsLoading: 'Generating…',
        generateDocsTitle: 'Fetch help and signatures of all methods, render Markdown and download',
        theme: 'Theme',
        themeSystem: 'System',
        themeLight: 'Light',
        themeDark: 'Dark',
        language: 'Language',
        languageSystem: 'Follow system',
        languageEn: 'English',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageJa: '日本語',
    },
    sidebar: {
        methods: 'Methods',
        metrics: 'Metrics',
        search: 'Search',
        searchPlaceholder: 'Type keywords, space separated',
        matchCount: 'Matched {matched} / {total} methods',
        noMatch: 'No matching methods.',
        noMethods: 'No methods available.',
    },
    view: {
        label: 'View',
        methods: 'Methods',
        metrics: 'Metrics',
    },
    method: {
        selectHint: '← Select a method from the left to view help and signature.',
        loading: 'Loading…',
        loadFailed: 'Load failed: {error}',
        help: 'Help',
        noHelp: '(no help available)',
        returnType: 'Return type',
        returnTypeHint: '(the server does not validate execution results against this type; actual values may differ)',
        none: '(none)',
    },
    test: {
        params: 'Parameters',
        paramsHint: '({count}, auto-generated from signature)',
        noParams: 'This method takes no parameters.',
        execute: 'Execute ▶',
        executing: 'Executing…',
        executeStream: 'Execute & receive stream ▶',
        receiving: 'Receiving…',
        resetToSample: 'Reset to sample',
        clearOutput: 'Clear output',
        result: 'Result',
        resultStream: ' (streaming)',
        notExecuted: '(not executed yet)',
        copyCurl: 'Copy curl (bash)',
        copyCurlCmd: 'Copy curl (cmd)',
        copyFetch: 'Copy fetch',
        copyTitle: 'Copy equivalent code for current call',
        copyDisabledTitle: 'Only HTTP transport can generate code',
        chooseFormat: 'Choose format',
        streamEnded: '(stream ended, {count} frames, total {duration})',
        streamEndedEmpty: '(stream ended, no data, total {duration})',
        elapsed: 'elapsed',
        firstFrame: 'first frame',
        jsonError: 'JSON error: {error}',
    },
    schema: {
        nullable: 'nullable',
        setNull: 'Set null',
        fillValue: 'Fill value',
        fixedValue: '(fixed value)',
        unionNoBranch: '(union has no branch)',
        arrayNoItem: '(array has no item schema)',
        recordNoValue: '(record has no value schema)',
        recordAddPlaceholder: 'New key',
        addRecordKey: '+ Add key',
        addItem: '+ Add item',
        strictHint: '(non-strict mode, extra fields allowed)',
        paramIndex: 'Parameter [{index}]',
        items: 'items',
        values: 'values',
        optionIndex: 'option[{index}]',
        inner: 'inner',
    },
    metrics: {
        title: 'Metrics',
        unavailable: 'Server did not enable system.metrics (withSystemMethods: false or not registered).',
        autoRefresh: 'Auto refresh',
        interval: 'Interval',
        refreshNow: 'Refresh now',
        refreshing: 'Refreshing…',
        uptime: 'uptime',
        loading: 'Loading…',
        methods: 'Methods',
        calls: 'Calls',
        streams: 'Streams',
        errors: 'Errors',
        errorRate: 'Error rate',
        invalidRequests: 'Invalid requests',
        nonStreamTitle: 'Non-stream methods',
        streamTitle: 'Stream methods',
        noData: 'No data.',
        noStreams: 'No streaming calls.',
        countHint: ' ({count})',
        colMethod: 'method',
        colCalls: 'calls',
        colRate: 'rate/s',
        colErrors: 'errors',
        colErrPct: 'err%',
        colP50: 'p50',
        colP95: 'p95',
        colP99: 'p99',
        colAvg: 'avg',
        colOpened: 'opened',
        colCompleted: 'completed',
        colFailed: 'failed',
        colAborted: 'aborted',
        colCompletePct: 'complete%',
        colAbortPct: 'abort%',
        colAvgChunks: 'avg chunks',
        colTtfbP50: 'ttfb p50',
        colTtfbP95: 'ttfb p95',
        colDurationAvg: 'duration avg',
    },
    footer: {
        version: 'version',
        npm: 'npm package',
        github: 'GitHub repository',
    },
    alerts: {
        emptyMethods: 'Method list is empty. Please refresh methods first.',
        docsFailed: 'Failed to generate docs: {error}',
    },
};

export const zhCN: Messages = {
    common: {
        loading: '加载中…',
        refresh: '刷新',
        refreshing: '刷新中…',
        reset: '重置',
        clear: '清空',
        delete: '删除',
        add: '添加',
        copy: '复制',
        copied: '已复制 ✓',
        copyFailed: '复制失败：{error}',
        generate: '生成',
        generating: '生成中…',
        none: '无',
        empty: '空',
    },
    toolbar: {
        title: 'JSON-RPC 2.0',
        transport: '传输方式',
        http: 'HTTP',
        ws: 'WebSocket',
        refreshMethods: '刷新方法列表',
        refreshMethodsLoading: '刷新中…',
        generateDocs: '生成文档 ⬇',
        generateDocsLoading: '生成中…',
        generateDocsTitle: '拉取所有方法的帮助与签名，生成 Markdown 文档并下载',
        theme: '主题',
        themeSystem: '跟随系统',
        themeLight: '亮',
        themeDark: '暗',
        language: '语言',
        languageSystem: '跟随系统语言',
        languageEn: 'English',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageJa: '日本語',
    },
    sidebar: {
        methods: 'Methods',
        metrics: 'Metrics',
        search: '搜索',
        searchPlaceholder: '输入关键词，空格分隔',
        matchCount: '匹配 {matched} / {total} 个方法',
        noMatch: '没有匹配的方法。',
        noMethods: '暂无可用方法。',
    },
    view: {
        label: '视图',
        methods: 'Methods',
        metrics: 'Metrics',
    },
    method: {
        selectHint: '← 从左侧选择一个方法查看帮助与签名。',
        loading: '加载中…',
        loadFailed: '加载失败：{error}',
        help: 'Help',
        noHelp: '（无帮助信息）',
        returnType: '返回类型',
        returnTypeHint: '（服务端不会校验执行结果是否符合此类型，实际返回值可能会有所不同）',
        none: '（暂无）',
    },
    test: {
        params: '参数',
        paramsHint: '（{count} 个，按签名自动生成）',
        noParams: '此方法无需参数。',
        execute: '执行 ▶',
        executing: '执行中…',
        executeStream: '执行并接收流 ▶',
        receiving: '接收中…',
        resetToSample: '重置为示例',
        clearOutput: '清空输出',
        result: '结果',
        resultStream: '（流式）',
        notExecuted: '（尚未执行）',
        copyCurl: '复制 curl (bash)',
        copyCurlCmd: '复制 curl (cmd)',
        copyFetch: '复制 fetch',
        copyTitle: '复制当前调用的等价代码',
        copyDisabledTitle: '仅 HTTP 传输可生成代码',
        chooseFormat: '选择复制格式',
        streamEnded: '（流已结束，共 {count} 帧，总耗时 {duration}）',
        streamEndedEmpty: '（流已结束，无数据，总耗时 {duration}）',
        elapsed: '耗时',
        firstFrame: '首帧',
        jsonError: 'JSON 错误：{error}',
    },
    schema: {
        nullable: 'nullable',
        setNull: '置 null',
        fillValue: '填值',
        fixedValue: '（固定值）',
        unionNoBranch: '（union 无分支）',
        arrayNoItem: '（数组无 item schema）',
        recordNoValue: '（record 无 value schema）',
        recordAddPlaceholder: '新键名',
        addRecordKey: '+ 添加键',
        addItem: '+ 添加项',
        strictHint: '（非 strict 模式，允许额外字段）',
        paramIndex: '参数 [{index}]',
        items: 'items',
        values: 'values',
        optionIndex: 'option[{index}]',
        inner: 'inner',
    },
    metrics: {
        title: 'Metrics',
        unavailable: '服务端未启用 system.metrics（withSystemMethods: false 或未注册）。',
        autoRefresh: '自动刷新',
        interval: '刷新间隔',
        refreshNow: '立即刷新',
        refreshing: '刷新中…',
        uptime: 'uptime',
        loading: '加载中…',
        methods: 'Methods',
        calls: 'Calls',
        streams: 'Streams',
        errors: 'Errors',
        errorRate: 'Error rate',
        invalidRequests: 'Invalid requests',
        nonStreamTitle: 'Non-stream methods',
        streamTitle: 'Stream methods',
        noData: '暂无数据。',
        noStreams: '暂无流式调用。',
        countHint: '（{count}）',
        colMethod: 'method',
        colCalls: 'calls',
        colRate: 'rate/s',
        colErrors: 'errors',
        colErrPct: 'err%',
        colP50: 'p50',
        colP95: 'p95',
        colP99: 'p99',
        colAvg: 'avg',
        colOpened: 'opened',
        colCompleted: 'completed',
        colFailed: 'failed',
        colAborted: 'aborted',
        colCompletePct: 'complete%',
        colAbortPct: 'abort%',
        colAvgChunks: 'avg chunks',
        colTtfbP50: 'ttfb p50',
        colTtfbP95: 'ttfb p95',
        colDurationAvg: 'duration avg',
    },
    footer: {
        version: '版本',
        npm: 'npm 包',
        github: 'GitHub 仓库',
    },
    alerts: {
        emptyMethods: '方法列表为空，请先刷新方法列表。',
        docsFailed: '生成文档失败：{error}',
    },
};

export const zhTW: Messages = {
    common: {
        loading: '載入中…',
        refresh: '重新整理',
        refreshing: '重新整理中…',
        reset: '重設',
        clear: '清除',
        delete: '刪除',
        add: '新增',
        copy: '複製',
        copied: '已複製 ✓',
        copyFailed: '複製失敗：{error}',
        generate: '產生',
        generating: '產生中…',
        none: '無',
        empty: '空',
    },
    toolbar: {
        title: 'JSON-RPC 2.0',
        transport: '傳輸方式',
        http: 'HTTP',
        ws: 'WebSocket',
        refreshMethods: '重新整理方法清單',
        refreshMethodsLoading: '重新整理中…',
        generateDocs: '產生文件 ⬇',
        generateDocsLoading: '產生中…',
        generateDocsTitle: '取得所有方法的說明與簽章，產生 Markdown 文件並下載',
        theme: '主題',
        themeSystem: '跟隨系統',
        themeLight: '亮',
        themeDark: '暗',
        language: '語言',
        languageSystem: '跟隨系統語言',
        languageEn: 'English',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageJa: '日本語',
    },
    sidebar: {
        methods: 'Methods',
        metrics: 'Metrics',
        search: '搜尋',
        searchPlaceholder: '輸入關鍵字，以空格分隔',
        matchCount: '符合 {matched} / {total} 個方法',
        noMatch: '沒有符合的方法。',
        noMethods: '尚無可用方法。',
    },
    view: {
        label: '檢視',
        methods: 'Methods',
        metrics: 'Metrics',
    },
    method: {
        selectHint: '← 從左側選擇一個方法以檢視說明與簽章。',
        loading: '載入中…',
        loadFailed: '載入失敗：{error}',
        help: 'Help',
        noHelp: '（無說明資訊）',
        returnType: '回傳型別',
        returnTypeHint: '（伺服器不會驗證執行結果是否符合此型別，實際回傳值可能有所不同）',
        none: '（暫無）',
    },
    test: {
        params: '參數',
        paramsHint: '（{count} 個，依簽章自動產生）',
        noParams: '此方法無需參數。',
        execute: '執行 ▶',
        executing: '執行中…',
        executeStream: '執行並接收串流 ▶',
        receiving: '接收中…',
        resetToSample: '重設為範例',
        clearOutput: '清除輸出',
        result: '結果',
        resultStream: '（串流）',
        notExecuted: '（尚未執行）',
        copyCurl: '複製 curl (bash)',
        copyCurlCmd: '複製 curl (cmd)',
        copyFetch: '複製 fetch',
        copyTitle: '複製目前呼叫的等效程式碼',
        copyDisabledTitle: '僅 HTTP 傳輸可產生程式碼',
        chooseFormat: '選擇複製格式',
        streamEnded: '（串流已結束，共 {count} 幀，總耗時 {duration}）',
        streamEndedEmpty: '（串流已結束，無資料，總耗時 {duration}）',
        elapsed: '耗時',
        firstFrame: '首幀',
        jsonError: 'JSON 錯誤：{error}',
    },
    schema: {
        nullable: 'nullable',
        setNull: '設為 null',
        fillValue: '填入值',
        fixedValue: '（固定值）',
        unionNoBranch: '（union 無分支）',
        arrayNoItem: '（陣列無 item schema）',
        recordNoValue: '（record 無 value schema）',
        recordAddPlaceholder: '新鍵名',
        addRecordKey: '+ 新增鍵',
        addItem: '+ 新增項目',
        strictHint: '（非 strict 模式，允許額外欄位）',
        paramIndex: '參數 [{index}]',
        items: 'items',
        values: 'values',
        optionIndex: 'option[{index}]',
        inner: 'inner',
    },
    metrics: {
        title: 'Metrics',
        unavailable: '伺服器未啟用 system.metrics（withSystemMethods: false 或未註冊）。',
        autoRefresh: '自動重新整理',
        interval: '重新整理間隔',
        refreshNow: '立即重新整理',
        refreshing: '重新整理中…',
        uptime: 'uptime',
        loading: '載入中…',
        methods: 'Methods',
        calls: 'Calls',
        streams: 'Streams',
        errors: 'Errors',
        errorRate: 'Error rate',
        invalidRequests: 'Invalid requests',
        nonStreamTitle: 'Non-stream methods',
        streamTitle: 'Stream methods',
        noData: '尚無資料。',
        noStreams: '尚無串流呼叫。',
        countHint: '（{count}）',
        colMethod: 'method',
        colCalls: 'calls',
        colRate: 'rate/s',
        colErrors: 'errors',
        colErrPct: 'err%',
        colP50: 'p50',
        colP95: 'p95',
        colP99: 'p99',
        colAvg: 'avg',
        colOpened: 'opened',
        colCompleted: 'completed',
        colFailed: 'failed',
        colAborted: 'aborted',
        colCompletePct: 'complete%',
        colAbortPct: 'abort%',
        colAvgChunks: 'avg chunks',
        colTtfbP50: 'ttfb p50',
        colTtfbP95: 'ttfb p95',
        colDurationAvg: 'duration avg',
    },
    footer: {
        version: '版本',
        npm: 'npm 套件',
        github: 'GitHub 儲存庫',
    },
    alerts: {
        emptyMethods: '方法清單為空，請先重新整理方法清單。',
        docsFailed: '產生文件失敗：{error}',
    },
};

export const ja: Messages = {
    common: {
        loading: '読み込み中…',
        refresh: '更新',
        refreshing: '更新中…',
        reset: 'リセット',
        clear: 'クリア',
        delete: '削除',
        add: '追加',
        copy: 'コピー',
        copied: 'コピーしました ✓',
        copyFailed: 'コピーに失敗しました：{error}',
        generate: '生成',
        generating: '生成中…',
        none: 'なし',
        empty: '空',
    },
    toolbar: {
        title: 'JSON-RPC 2.0',
        transport: 'トランスポート',
        http: 'HTTP',
        ws: 'WebSocket',
        refreshMethods: 'メソッド一覧を更新',
        refreshMethodsLoading: '更新中…',
        generateDocs: 'ドキュメント生成 ⬇',
        generateDocsLoading: '生成中…',
        generateDocsTitle: '全メソッドのヘルプとシグネチャを取得し、Markdown を生成してダウンロード',
        theme: 'テーマ',
        themeSystem: 'システムに従う',
        themeLight: 'ライト',
        themeDark: 'ダーク',
        language: '言語',
        languageSystem: 'システム言語に従う',
        languageEn: 'English',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageJa: '日本語',
    },
    sidebar: {
        methods: 'Methods',
        metrics: 'Metrics',
        search: '検索',
        searchPlaceholder: 'キーワードを入力（スペース区切り）',
        matchCount: '{matched} / {total} 件のメソッドが一致',
        noMatch: '一致するメソッドはありません。',
        noMethods: '利用可能なメソッドがありません。',
    },
    view: {
        label: 'ビュー',
        methods: 'Methods',
        metrics: 'Metrics',
    },
    method: {
        selectHint: '← 左側からメソッドを選択すると、ヘルプとシグネチャが表示されます。',
        loading: '読み込み中…',
        loadFailed: '読み込み失敗：{error}',
        help: 'Help',
        noHelp: '（ヘルプ情報なし）',
        returnType: '戻り値の型',
        returnTypeHint: '（サーバーは実行結果がこの型に一致するか検証しません。実際の戻り値は異なる場合があります）',
        none: '（なし）',
    },
    test: {
        params: 'パラメータ',
        paramsHint: '（{count} 個、シグネチャから自動生成）',
        noParams: 'このメソッドはパラメータを取りません。',
        execute: '実行 ▶',
        executing: '実行中…',
        executeStream: '実行してストリーム受信 ▶',
        receiving: '受信中…',
        resetToSample: 'サンプルに戻す',
        clearOutput: '出力をクリア',
        result: '結果',
        resultStream: '（ストリーミング）',
        notExecuted: '（未実行）',
        copyCurl: 'curl をコピー (bash)',
        copyCurlCmd: 'curl をコピー (cmd)',
        copyFetch: 'fetch をコピー',
        copyTitle: '現在の呼び出しに相当するコードをコピー',
        copyDisabledTitle: 'コード生成は HTTP トランスポートのみ対応',
        chooseFormat: 'コピー形式を選択',
        streamEnded: '（ストリーム終了、{count} フレーム、合計 {duration}）',
        streamEndedEmpty: '（ストリーム終了、データなし、合計 {duration}）',
        elapsed: '経過',
        firstFrame: '初回フレーム',
        jsonError: 'JSON エラー：{error}',
    },
    schema: {
        nullable: 'nullable',
        setNull: 'null にする',
        fillValue: '値を入力',
        fixedValue: '（固定値）',
        unionNoBranch: '（union に分岐がありません）',
        arrayNoItem: '（配列に item schema がありません）',
        recordNoValue: '（record に value schema がありません）',
        recordAddPlaceholder: '新しいキー',
        addRecordKey: '+ キーを追加',
        addItem: '+ 項目を追加',
        strictHint: '（非 strict モード、追加フィールドを許可）',
        paramIndex: 'パラメータ [{index}]',
        items: 'items',
        values: 'values',
        optionIndex: 'option[{index}]',
        inner: 'inner',
    },
    metrics: {
        title: 'Metrics',
        unavailable: 'サーバーで system.metrics が有効になっていません（withSystemMethods: false または未登録）。',
        autoRefresh: '自動更新',
        interval: '更新間隔',
        refreshNow: '今すぐ更新',
        refreshing: '更新中…',
        uptime: 'uptime',
        loading: '読み込み中…',
        methods: 'Methods',
        calls: 'Calls',
        streams: 'Streams',
        errors: 'Errors',
        errorRate: 'Error rate',
        invalidRequests: 'Invalid requests',
        nonStreamTitle: 'Non-stream methods',
        streamTitle: 'Stream methods',
        noData: 'データがありません。',
        noStreams: 'ストリーミング呼び出しはありません。',
        countHint: '（{count}）',
        colMethod: 'method',
        colCalls: 'calls',
        colRate: 'rate/s',
        colErrors: 'errors',
        colErrPct: 'err%',
        colP50: 'p50',
        colP95: 'p95',
        colP99: 'p99',
        colAvg: 'avg',
        colOpened: 'opened',
        colCompleted: 'completed',
        colFailed: 'failed',
        colAborted: 'aborted',
        colCompletePct: 'complete%',
        colAbortPct: 'abort%',
        colAvgChunks: 'avg chunks',
        colTtfbP50: 'ttfb p50',
        colTtfbP95: 'ttfb p95',
        colDurationAvg: 'duration avg',
    },
    footer: {
        version: 'バージョン',
        npm: 'npm パッケージ',
        github: 'GitHub リポジトリ',
    },
    alerts: {
        emptyMethods: 'メソッド一覧が空です。先にメソッド一覧を更新してください。',
        docsFailed: 'ドキュメント生成に失敗しました：{error}',
    },
};

export const MESSAGES: Record<Locale, Messages> = {
    en,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    ja,
};