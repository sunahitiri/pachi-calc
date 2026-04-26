import { useState, useMemo } from 'react';

// localStorage キー (App.jsx / SessionRecorder.jsx と同期させること)
const KEY_RECORDS = 'pachi-records';
const KEY_MACHINES = 'pachi-machines';
const KEY_ACTIVE_SESSION = 'pachi-active-session';

const APP_TAG = 'pachi-calc';
const FORMAT_VERSION = 1;

// localStorage から JSON.parse して返す。失敗時は fallback
function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// 現在の localStorage 内容をエクスポート用 JSON 文字列に整形
function buildExportPayload() {
  const records = readKey(KEY_RECORDS, []);
  const machines = readKey(KEY_MACHINES, []);
  const activeSession = readKey(KEY_ACTIVE_SESSION, null);
  const payload = {
    app: APP_TAG,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    records,
    machines,
    activeSession,
  };
  return JSON.stringify(payload, null, 2);
}

// 入力 JSON を検証してパース。失敗時は { error: string } を返す
function parseImportPayload(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { error: `JSON 解析に失敗しました: ${e.message}` };
  }
  if (!obj || typeof obj !== 'object') {
    return { error: 'JSON のトップレベルがオブジェクトではありません' };
  }
  if (obj.app !== APP_TAG) {
    return { error: `app フィールドが "${APP_TAG}" ではありません (受信値: ${JSON.stringify(obj.app)})` };
  }
  if (obj.version !== FORMAT_VERSION) {
    return {
      error: `version ${FORMAT_VERSION} のみ対応しています (受信値: ${JSON.stringify(obj.version)})`,
    };
  }
  if (!Array.isArray(obj.records)) return { error: 'records が配列ではありません' };
  if (!Array.isArray(obj.machines)) return { error: 'machines が配列ではありません' };
  return { payload: obj };
}

// 今日の日付 (YYYY-MM-DD) を返す。ファイル名用
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function DataMigration() {
  // エクスポート時の小ステータス表示 ("コピーしました" 等)
  const [exportStatus, setExportStatus] = useState('');
  // クリップボード API が失敗したときに JSON を表示するフォールバック
  const [fallbackJson, setFallbackJson] = useState('');

  // インポート用 textarea の中身
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  // インポート前のプレビュー (パース成功時のみセット)
  const [importPreview, setImportPreview] = useState(null);

  // 現在の件数 (エクスポート前に件数を表示するため)
  const counts = useMemo(() => {
    const records = readKey(KEY_RECORDS, []);
    const machines = readKey(KEY_MACHINES, []);
    const activeSession = readKey(KEY_ACTIVE_SESSION, null);
    return {
      records: Array.isArray(records) ? records.length : 0,
      machines: Array.isArray(machines) ? machines.length : 0,
      hasActive: activeSession !== null && activeSession !== undefined,
    };
  }, []);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // ----- エクスポート -----

  const handleCopy = async () => {
    setExportStatus('');
    setFallbackJson('');
    const json = buildExportPayload();
    try {
      await navigator.clipboard.writeText(json);
      setExportStatus('クリップボードにコピーしました');
    } catch {
      // 失敗時は textarea で表示してユーザーが手動コピーできるようにする
      setFallbackJson(json);
      setExportStatus('クリップボード API が使えません。下の枠を全選択してコピーしてください。');
    }
  };

  const handleShare = async () => {
    setExportStatus('');
    setFallbackJson('');
    const json = buildExportPayload();
    try {
      await navigator.share({
        title: 'pachi-calc バックアップ',
        text: json,
      });
      setExportStatus('共有シートを開きました');
    } catch (e) {
      // ユーザーがキャンセルした場合は AbortError なので静かに無視
      if (e && e.name !== 'AbortError') {
        setExportStatus(`共有に失敗: ${e.message ?? e}`);
      }
    }
  };

  const handleDownload = () => {
    setExportStatus('');
    setFallbackJson('');
    const json = buildExportPayload();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pachi-calc-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportStatus('ファイルをダウンロードしました');
  };

  // ----- インポート -----

  const handleFileLoad = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setImportText(text);
      setImportError('');
      setImportPreview(null);
    };
    reader.onerror = () => {
      setImportError('ファイルの読み込みに失敗しました');
    };
    reader.readAsText(file);
  };

  const handleValidate = () => {
    setImportError('');
    setImportPreview(null);
    const result = parseImportPayload(importText);
    if (result.error) {
      setImportError(result.error);
      return;
    }
    setImportPreview(result.payload);
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    const ok = window.confirm(
      '現在のデータをすべて上書きします。よろしいですか?\n(現端末上の記録・機種・進行中セッションが置き換わります)'
    );
    if (!ok) return;
    try {
      localStorage.setItem(KEY_RECORDS, JSON.stringify(importPreview.records));
      localStorage.setItem(KEY_MACHINES, JSON.stringify(importPreview.machines));
      // activeSession は省略可
      if (importPreview.activeSession === null || importPreview.activeSession === undefined) {
        localStorage.removeItem(KEY_ACTIVE_SESSION);
      } else {
        localStorage.setItem(KEY_ACTIVE_SESSION, JSON.stringify(importPreview.activeSession));
      }
    } catch (e) {
      setImportError(`保存に失敗: ${e.message ?? e}`);
      return;
    }
    // React state と整合させるため、明示的にリロード
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white text-base">データ移行</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          スマホ買い替え時など、別端末への引き継ぎに使えます。
        </p>
      </div>

      {/* ===== エクスポート ===== */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
        <div className="font-semibold text-slate-900 dark:text-white text-sm">📤 エクスポート</div>
        <div className="text-xs text-slate-600 dark:text-slate-300">
          記録 <strong>{counts.records}</strong> 件 / 機種{' '}
          <strong>{counts.machines}</strong> 件
          {counts.hasActive ? ' / 進行中セッションあり' : ''}
        </div>
        <div className={`grid gap-2 ${canShare ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            onClick={handleCopy}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2 rounded-lg text-sm font-medium"
          >
            📋 コピー
          </button>
          {canShare && (
            <button
              onClick={handleShare}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2 rounded-lg text-sm font-medium"
            >
              📤 共有
            </button>
          )}
          <button
            onClick={handleDownload}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2 rounded-lg text-sm font-medium"
          >
            💾 保存
          </button>
        </div>
        {exportStatus && (
          <div className="text-xs text-slate-700 dark:text-slate-200">{exportStatus}</div>
        )}
        {fallbackJson && (
          <textarea
            readOnly
            value={fallbackJson}
            onFocus={(e) => e.target.select()}
            className="w-full h-32 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          />
        )}
      </div>

      {/* ===== インポート ===== */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
        <div className="font-semibold text-slate-900 dark:text-white text-sm">📥 インポート</div>
        <div className="text-xs text-slate-600 dark:text-slate-300">
          別端末でエクスポートした JSON を貼り付けるか、ファイルから読み込んでください。
        </div>

        <textarea
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setImportError('');
            setImportPreview(null);
          }}
          placeholder='{"app":"pachi-calc", ...}'
          className="w-full h-32 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 py-2 rounded-lg text-sm font-medium text-center cursor-pointer">
            📂 ファイルから
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                handleFileLoad(f);
                e.target.value = ''; // 同じファイルを再選択できるようリセット
              }}
              className="hidden"
            />
          </label>
          <button
            onClick={handleValidate}
            disabled={!importText.trim()}
            className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-800 dark:text-slate-100 py-2 rounded-lg text-sm font-medium"
          >
            🔍 内容を確認
          </button>
        </div>

        {importError && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2">
            ⚠ {importError}
          </div>
        )}

        {importPreview && (
          <div className="space-y-2">
            <div className="text-xs text-slate-700 dark:text-slate-200 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded p-2">
              <div className="font-semibold mb-0.5">読み込み内容のプレビュー</div>
              <div>記録: <strong>{importPreview.records.length}</strong> 件</div>
              <div>機種: <strong>{importPreview.machines.length}</strong> 件</div>
              <div>
                進行中セッション:{' '}
                <strong>
                  {importPreview.activeSession === null || importPreview.activeSession === undefined
                    ? 'なし'
                    : 'あり'}
                </strong>
              </div>
              {importPreview.exportedAt && (
                <div className="text-slate-500 dark:text-slate-400 mt-1">
                  エクスポート日時: {importPreview.exportedAt}
                </div>
              )}
            </div>
            <button
              onClick={handleApplyImport}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white py-2 rounded-lg text-sm font-bold"
            >
              ⚠ この内容で上書きインポート
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              ※ 現端末のデータは置き換わります。実行後アプリは自動でリロードします。
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
