import { useEffect, useRef, useState } from 'react';
import { calcBorder } from '../utils/calculations';
import { fetchDmmMachine, parseDmmHtml } from '../utils/dmmFetch';

export default function MachineManager({ machines, setMachines }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragDy, setDragDy] = useState(0); // 指の Y 方向移動量 (px)
  const pressTimerRef = useRef(null);
  const pressPosRef = useRef(null);
  const cardRefs = useRef({});
  const listRef = useRef(null);
  // ドラッグ開始時のメタ情報: 元のインデックス / 指の開始Y / カード高さ+ギャップ
  const dragInfoRef = useRef(null);

  // ドラッグ中はブラウザのスクロールを抑止する必要があるが、
  // React の合成イベントは passive なので preventDefault() が効かない。
  // 非 passive のネイティブ touchmove リスナーを直接アタッチする。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (draggingId && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [draggingId]);
  const [form, setForm] = useState({
    name: '',
    probability: '',
    averagePayout: '',
    exchangeRate: '4',
    notes: '',
  });

  // DMM URL取得用
  const [showDmmInput, setShowDmmInput] = useState(false);
  const [dmmUrl, setDmmUrl] = useState('');
  const [dmmLoading, setDmmLoading] = useState(false);
  const [dmmError, setDmmError] = useState('');
  const [showDmmPaste, setShowDmmPaste] = useState(false);
  const [dmmHtml, setDmmHtml] = useState('');

  const resetForm = () => {
    setForm({ name: '', probability: '', averagePayout: '', exchangeRate: '4', notes: '' });
    setEditing(null);
    setShowForm(false);
    setDmmError('');
    setDmmHtml('');
    setShowDmmPaste(false);
  };

  const applySpecToForm = (spec) => {
    setForm({
      name: spec.name,
      probability: spec.probability.toString(),
      averagePayout: spec.averagePayout.toString(),
      exchangeRate: spec.exchangeRate.toString(),
      notes: `DMM出典 (参考ボーダー: ${spec.referenceBorder ?? '?'}回/1K)`,
    });
    setEditing(null);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.probability || !form.averagePayout || !form.exchangeRate) return;
    const data = {
      id: editing?.id || `custom-${Date.now()}`,
      name: form.name,
      category: 'パチンコ',
      probability: Number(form.probability),
      averagePayout: Number(form.averagePayout),
      exchangeRate: Number(form.exchangeRate),
      notes: form.notes,
    };
    if (editing) {
      setMachines(machines.map((m) => (m.id === editing.id ? data : m)));
    } else {
      setMachines([...machines, data]);
    }
    resetForm();
  };

  const handleEdit = (m) => {
    setEditing(m);
    setForm({
      name: m.name,
      probability: m.probability?.toString() || '',
      averagePayout: m.averagePayout?.toString() || '',
      exchangeRate: m.exchangeRate?.toString() || '4',
      notes: m.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm('この機種を削除しますか？')) {
      setMachines(machines.filter((m) => m.id !== id));
    }
  };

  const handleDmmFetch = async () => {
    setDmmError('');
    setDmmLoading(true);
    try {
      const spec = await fetchDmmMachine(dmmUrl);
      applySpecToForm(spec);
      setShowDmmInput(false);
      setDmmUrl('');
    } catch (e) {
      setDmmError(e.message || '取得に失敗しました');
    } finally {
      setDmmLoading(false);
    }
  };

  // 長押しドラッグで並べ替え
  const LONG_PRESS_MS = 500;
  const MOVE_CANCEL_PX = 8;

  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    pressPosRef.current = null;
  };

  const handleCardPointerDown = (id, e) => {
    // 編集/削除ボタン等の操作は長押し対象外 (呼び出し側で stopPropagation 済み)
    pressPosRef.current = { x: e.clientX, y: e.clientY };
    // ドラッグ中も確実に pointermove を受け取るためポインタを捕捉
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch { /* noop */ }
    const startY = e.clientY;
    pressTimerRef.current = setTimeout(() => {
      const originIdx = machines.findIndex((m) => m.id === id);
      const cardEl = cardRefs.current[id];
      // 1 スロット分の縦移動量 = カード高さ + space-y-2 の 8px
      const cardFullH = cardEl ? cardEl.offsetHeight + 8 : 80;
      dragInfoRef.current = { originIdx, startY, cardFullH };
      setDraggingId(id);
      setDragDy(0);
      pressTimerRef.current = null;
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  };

  const handleCardPointerMove = (e) => {
    // 長押し発動前に大きく動いたらキャンセル (スクロールとして扱う)
    if (pressTimerRef.current && pressPosRef.current) {
      const dx = e.clientX - pressPosRef.current.x;
      const dy = e.clientY - pressPosRef.current.y;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) cancelPress();
    }
    if (!draggingId || !dragInfoRef.current) return;
    e.preventDefault();
    // 指の移動量を反映 (カードの translateY に使用)
    setDragDy(e.clientY - dragInfoRef.current.startY);

    const fromIdx = machines.findIndex((m) => m.id === draggingId);
    if (fromIdx < 0) return;
    let toIdx = fromIdx;
    for (let i = 0; i < machines.length; i++) {
      if (machines[i].id === draggingId) continue;
      const el = cardRefs.current[machines[i].id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (e.clientY < mid && i < fromIdx && i < toIdx) toIdx = i;
      if (e.clientY > mid && i > fromIdx && i > toIdx) toIdx = i;
    }
    if (toIdx !== fromIdx) {
      const next = [...machines];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setMachines(next);
    }
  };

  const handleCardPointerUp = () => {
    cancelPress();
    setDraggingId(null);
    setDragDy(0);
    dragInfoRef.current = null;
  };

  const handleDmmPaste = () => {
    setDmmError('');
    try {
      const spec = parseDmmHtml(dmmHtml, dmmUrl);
      applySpecToForm(spec);
      setShowDmmInput(false);
      setShowDmmPaste(false);
      setDmmUrl('');
      setDmmHtml('');
    } catch (e) {
      setDmmError(e.message || '解析に失敗しました');
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-bold text-slate-900 dark:text-white">登録機種</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowDmmInput(true);
              setDmmError('');
            }}
            className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-purple-700"
          >
            🔗 DMM
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
          >
            + 追加
          </button>
        </div>
      </div>

      {showDmmInput && (
        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
            DMM P-townのURLから自動取得
          </div>
          <input
            type="url"
            placeholder="https://p-town.dmm.com/machines/4457"
            value={dmmUrl}
            onChange={(e) => setDmmUrl(e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
            disabled={dmmLoading}
          />
          {dmmError && (
            <div className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">⚠️ {dmmError}</div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleDmmFetch}
              disabled={dmmLoading || !dmmUrl}
              className="flex-1 bg-purple-600 text-white py-1.5 rounded text-sm font-medium disabled:opacity-50"
            >
              {dmmLoading ? '取得中...' : '自動取得'}
            </button>
            <button
              onClick={() => setShowDmmPaste((v) => !v)}
              disabled={dmmLoading}
              className="flex-1 bg-indigo-600 text-white py-1.5 rounded text-sm font-medium disabled:opacity-50"
            >
              {showDmmPaste ? '手動を閉じる' : '📋 手動貼り付け'}
            </button>
            <button
              onClick={() => {
                setShowDmmInput(false);
                setShowDmmPaste(false);
                setDmmUrl('');
                setDmmHtml('');
                setDmmError('');
              }}
              disabled={dmmLoading}
              className="flex-1 bg-slate-300 dark:bg-slate-600 dark:text-white py-1.5 rounded text-sm font-medium disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>

          {showDmmPaste && (
            <div className="mt-2 space-y-2 border-t border-purple-300 dark:border-purple-700 pt-2">
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <div className="font-semibold mb-1">📖 403エラー回避の手順</div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>ブラウザでDMMページを開く（上のURL）</li>
                  <li>ページ上で右クリック →「ページのソースを表示」</li>
                  <li>Ctrl+A で全選択 → Ctrl+C でコピー</li>
                  <li>下の枠に貼り付け（Ctrl+V）→ 解析ボタン</li>
                </ol>
              </div>
              <textarea
                value={dmmHtml}
                onChange={(e) => setDmmHtml(e.target.value)}
                placeholder="<!doctype html>..... ページ全体のHTMLを貼り付けてください"
                rows={5}
                className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-xs font-mono"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                貼り付け済み: {dmmHtml.length.toLocaleString()} 文字
              </div>
              <button
                onClick={handleDmmPaste}
                disabled={!dmmHtml || dmmHtml.length < 500}
                className="w-full bg-indigo-600 text-white py-1.5 rounded text-sm font-medium disabled:opacity-50"
              >
                解析して編集
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg space-y-2 border border-slate-200 dark:border-slate-700">
          <input
            type="text"
            placeholder="機種名"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
            required
          />
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-0.5">初当たり確率の分母（例: 319.69）</label>
            <input
              type="number"
              step="0.01"
              placeholder="319.69"
              value={form.probability}
              onChange={(e) => setForm({ ...form, probability: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-0.5">平均出玉（連チャン込み・1当たり）</label>
            <input
              type="number"
              placeholder="例: 1500"
              value={form.averagePayout}
              onChange={(e) => setForm({ ...form, averagePayout: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-0.5">交換率（円/玉）</label>
            <select
              value={form.exchangeRate}
              onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
            >
              <option value="4">4.00（等価）</option>
              <option value="3.57">3.57（28個交換）</option>
              <option value="3.33">3.33（30個交換）</option>
              <option value="2.5">2.50（2.5円パチ）</option>
              <option value="1">1.00（1円パチ）</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="メモ"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm font-medium"
            >
              {editing ? '更新' : '追加'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 bg-slate-300 dark:bg-slate-600 dark:text-white py-1.5 rounded text-sm font-medium"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div ref={listRef} className="space-y-2">
        {machines.map((m, i) => {
          const border = calcBorder(m);
          const isDragging = draggingId === m.id;
          // ドラッグ中のカードを指に追従させる:
          //   DOM 上での移動量 = (現在の index - 元の index) * カード高さ
          //   translateY = 指の移動量 - DOM 上での移動量
          // ⇒ カードの見た目の位置は常に指の位置に一致する。
          let transform;
          if (isDragging && dragInfoRef.current) {
            const info = dragInfoRef.current;
            const domOffset = (i - info.originIdx) * info.cardFullH;
            const ty = dragDy - domOffset;
            transform = `translate3d(0, ${ty}px, 0) scale(1.03)`;
          }
          return (
            <div
              key={m.id}
              ref={(el) => {
                if (el) cardRefs.current[m.id] = el;
                else delete cardRefs.current[m.id];
              }}
              onPointerDown={(e) => handleCardPointerDown(m.id, e)}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerUp}
              onPointerLeave={(e) => {
                // ドラッグ中以外は、要素外に出たら長押しタイマーをキャンセル
                if (!draggingId) cancelPress();
                else e.preventDefault();
              }}
              style={{
                touchAction: draggingId ? 'none' : 'auto',
                transform,
                zIndex: isDragging ? 20 : undefined,
                // ドラッグ中は追従のため transition を切る / 離したら位置への snap を滑らかに
                transition: isDragging ? 'none' : 'transform 220ms ease-out, box-shadow 150ms',
                position: 'relative',
              }}
              className={`bg-white dark:bg-slate-800 border rounded-lg p-3 shadow-sm select-none ${
                isDragging
                  ? 'border-blue-500 ring-2 ring-blue-400 shadow-xl cursor-grabbing'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white text-sm">{m.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    1/{m.probability} / 平均{m.averagePayout}発 / {m.exchangeRate}円
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    ボーダー: {border.toFixed(2)} 回/1K
                  </div>
                  {m.notes && (
                    <div className="text-xs text-slate-400 mt-0.5">{m.notes}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleEdit(m)}
                    className="text-blue-600 dark:text-blue-400 text-xs px-2 py-1"
                  >
                    編集
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleDelete(m.id)}
                    className="text-red-500 text-xs px-2 py-1"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300">
        <div className="font-semibold mb-1">💡 機種データの追加方法</div>
        <div>
          <strong>🔗 DMM ボタン:</strong> DMM P-townの機種ページURL（例: https://p-town.dmm.com/machines/4457）から自動取得します。
        </div>
        <div className="mt-1">
          <strong>+ 追加 ボタン:</strong> 手動で初当たり確率と平均出玉（連チャン込み）を入力します。ボーダーは自動計算されます。
        </div>
        <div className="mt-1">
          <strong>並べ替え:</strong> カードを長押し（約0.5秒）→ 上下にドラッグで順番を入れ替えられます。
        </div>
      </div>
    </div>
  );
}
