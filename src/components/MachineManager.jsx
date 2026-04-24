import { Fragment, useEffect, useRef, useState } from 'react';
import { calcBorder, calcHourlyBorder } from '../utils/calculations';
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
  // 編集フォームをスクロール表示するための ref (編集対象カード直下にインライン表示)
  const editFormRef = useRef(null);
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
  // 機種登録は常に 1玉=4円 基準。交換率は遊戯開始時にセッション側で選択する。
  const [form, setForm] = useState({
    name: '',
    probability: '',
    averagePayout: '',
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
    setForm({ name: '', probability: '', averagePayout: '', notes: '' });
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
      notes: `DMM出典 (参考ボーダー: ${spec.referenceBorder ?? '?'}回/1K)`,
    });
    setEditing(null);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.probability || !form.averagePayout) return;
    const data = {
      id: editing?.id || `custom-${Date.now()}`,
      name: form.name,
      category: 'パチンコ',
      probability: Number(form.probability),
      averagePayout: Number(form.averagePayout),
      exchangeRate: 4, // 機種情報は常に 1玉=4円 基準で保存
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
      notes: m.notes || '',
    });
<<<<<<< HEAD
    setShowForm(true);
    // フォームが編集対象のカード直下に挿入されるので、画面内に収まるよう少しスクロール
    requestAnimationFrame(() => {
      editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
=======
    setShowForm(false); // 新規追加フォームは閉じる
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135
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

  // 追加 / 編集フォーム本体。追加時はリスト上部、編集時は対象カード直下に描画する。
  // attachRef=true の時だけ editFormRef を取り付け、scrollIntoView の対象にする。
  const renderForm = (attachRef) => (
    <form
      ref={attachRef ? editFormRef : undefined}
      onSubmit={handleSubmit}
      onPointerDown={(e) => e.stopPropagation()}
      className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg space-y-2 border border-slate-200 dark:border-slate-700"
    >
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
  );

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

<<<<<<< HEAD
      {/* 追加フォーム (editing 中はインライン表示するのでここには出さない) */}
      {showForm && !editing && renderForm(false)}
=======
      {showForm && !editing && (
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
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135

      <div ref={listRef} className="space-y-2">
        {machines.map((m, i) => {
          const border = calcBorder(m);
          const hourlyBorder = calcHourlyBorder(m);
          const isEditing = editing?.id === m.id;
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
          const isEditingThis = editing?.id === m.id;
          return (
<<<<<<< HEAD
            <Fragment key={m.id}>
=======
            <div key={m.id}>
              {/* 機種カード */}
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135
              <div
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
<<<<<<< HEAD
                    : isEditingThis
                    ? 'border-blue-400 ring-1 ring-blue-300 dark:ring-blue-500'
=======
                    : isEditing
                    ? 'border-blue-400 dark:border-blue-600'
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                      <span>1/{m.probability} / 平均{m.averagePayout}発 / {m.exchangeRate}円</span>
                      <span className="text-blue-600 dark:text-blue-400">B:{border.toFixed(1)}</span>
                      {hourlyBorder > 0 && (
                        <span className="text-blue-600 dark:text-blue-400">時給1K:{hourlyBorder.toFixed(1)}</span>
                      )}
                    </div>
                    {m.notes && (
                      <div className="text-xs text-slate-400 mt-0.5">{m.notes}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
<<<<<<< HEAD
                      onClick={() => (isEditingThis ? resetForm() : handleEdit(m))}
                      className="text-blue-600 dark:text-blue-400 text-xs px-2 py-1"
                    >
                      {isEditingThis ? '閉じる' : '編集'}
=======
                      onClick={() => isEditing ? resetForm() : handleEdit(m)}
                      className={`text-xs px-2 py-1 ${isEditing ? 'text-slate-500 dark:text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}
                    >
                      {isEditing ? 'キャンセル' : '編集'}
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135
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
<<<<<<< HEAD
              {isEditingThis && renderForm(true)}
            </Fragment>
=======

              {/* インライン編集フォーム */}
              {isEditing && (
                <form
                  onSubmit={handleSubmit}
                  className="mt-1 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg space-y-2 border border-blue-300 dark:border-blue-700"
                >
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
                      更新
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
            </div>
>>>>>>> 478d8a54dd8189cbb1e1cd2bcf1191a278af4135
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
