import { useState } from 'react';

export default function MachineManager({ machines, setMachines }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: '',
    border: '',
    valuePerRotation: '',
    notes: '',
  });

  const resetForm = () => {
    setForm({ name: '', border: '', valuePerRotation: '', notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.border || !form.valuePerRotation) return;
    const data = {
      id: editing?.id || `custom-${Date.now()}`,
      name: form.name,
      category: 'パチンコ',
      border: Number(form.border),
      valuePerRotation: Number(form.valuePerRotation),
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
      border: m.border.toString(),
      valuePerRotation: m.valuePerRotation.toString(),
      notes: m.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm('この機種を削除しますか？')) {
      setMachines(machines.filter((m) => m.id !== id));
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-bold text-slate-900 dark:text-white">登録機種</h2>
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
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.1"
              placeholder="ボーダー（例: 18.5）"
              value={form.border}
              onChange={(e) => setForm({ ...form, border: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
              required
            />
            <input
              type="number"
              step="0.1"
              placeholder="1回転の価値（例: 2.8）"
              value={form.valuePerRotation}
              onChange={(e) => setForm({ ...form, valuePerRotation: e.target.value })}
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

      <div className="space-y-2">
        {machines.map((m) => (
          <div
            key={m.id}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-medium text-slate-900 dark:text-white text-sm">{m.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  ボーダー: {m.border} / 1回転: ¥{m.valuePerRotation}
                </div>
                {m.notes && (
                  <div className="text-xs text-slate-400 mt-0.5">{m.notes}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(m)}
                  className="text-blue-600 dark:text-blue-400 text-xs px-2 py-1"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-red-500 text-xs px-2 py-1"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300">
        <div className="font-semibold mb-1">💡 機種データの追加方法</div>
        <div>DMM.com（P-town）のボーダー表を参考に手入力してください。</div>
      </div>
    </div>
  );
}
