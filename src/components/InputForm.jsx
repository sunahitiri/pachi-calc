import { useState, useMemo } from 'react';
import { calcExpectedValue, rotationsPer1K, calcBorder } from '../utils/calculations';

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function InputForm({ machines, onAdd }) {
  const [date, setDate] = useState(todayStr());
  const [machineId, setMachineId] = useState(machines[0]?.id || '');
  const [rotations, setRotations] = useState('');
  const [investment, setInvestment] = useState('');
  const [notes, setNotes] = useState('');

  const selectedMachine = machines.find((m) => m.id === machineId);
  const border = selectedMachine ? calcBorder(selectedMachine) : 0;

  const { perK, expected } = useMemo(() => {
    const r = Number(rotations) || 0;
    const inv = Number(investment) || 0;
    return {
      perK: rotationsPer1K(r, inv).toFixed(2),
      expected: selectedMachine
        ? calcExpectedValue({ totalRotations: r, investment: inv, machine: selectedMachine })
        : 0,
    };
  }, [rotations, investment, selectedMachine]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!machineId || !rotations || !investment) return;
    onAdd({
      id: Date.now().toString(),
      date,
      machineId,
      rotations: Number(rotations),
      investment: Number(investment),
      notes,
      createdAt: new Date().toISOString(),
    });
    setRotations('');
    setInvestment('');
    setNotes('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">日付</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">機種</label>
        <select
          value={machineId}
          onChange={(e) => setMachineId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          required
        >
          <option value="">選択してください</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}（ボーダー{calcBorder(m).toFixed(1)}）
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">総回転数</label>
          <input
            type="number"
            inputMode="numeric"
            value={rotations}
            onChange={(e) => setRotations(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            placeholder="例: 500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">投資額(円)</label>
          <input
            type="number"
            inputMode="numeric"
            value={investment}
            onChange={(e) => setInvestment(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            placeholder="例: 20000"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">メモ（任意）</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          placeholder="ホール名など"
        />
      </div>

      {rotations && investment && selectedMachine && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-1">
          <div className="text-sm text-slate-600 dark:text-slate-300 flex justify-between">
            <span>1Kあたり回転数</span>
            <span className="font-semibold">{perK} 回</span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300 flex justify-between">
            <span>ボーダー</span>
            <span className="font-semibold">{border.toFixed(2)} 回</span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300 flex justify-between">
            <span>差分</span>
            <span className={`font-semibold ${(perK - border) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {(perK - border) >= 0 ? '+' : ''}{(perK - border).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-base pt-1 border-t border-blue-200 dark:border-blue-800">
            <span className="font-bold">期待値</span>
            <span className={`font-bold ${expected >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {expected >= 0 ? '+' : ''}{expected.toLocaleString()} 円
            </span>
          </div>
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 active:bg-blue-800 transition"
      >
        記録を追加
      </button>
    </form>
  );
}
