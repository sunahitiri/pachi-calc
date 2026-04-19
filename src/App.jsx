import { useRef, useState } from 'react';
import Header from './components/Header';
import SessionRecorder from './components/SessionRecorder';
import RecordList from './components/RecordList';
import MachineManager from './components/MachineManager';
import { useLocalStorage } from './hooks/useLocalStorage';
import defaultMachines from './data/machines.json';

const TABS = ['record', 'list', 'machines'];

function App() {
  const [tab, setTab] = useState('record');
  const [records, setRecords] = useLocalStorage('pachi-records', []);
  const [machines, setMachines] = useLocalStorage('pachi-machines', defaultMachines);

  const touchRef = useRef(null);

  const handleAdd = (record) => {
    setRecords([record, ...records]);
    // セッション終了後は記録タブの開始画面に留まる
  };

  const handleDelete = (id) => {
    setRecords(records.filter((r) => r.id !== id));
  };

  // 左右フリックでタブ切替
  const handleTouchStart = (e) => {
    // 入力系の要素上のタッチは無視 (ボタン/フォーム操作と競合させない)
    if (e.target.closest && e.target.closest('input,textarea,select,button,label')) {
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    // 横移動が十分大きく、縦移動より支配的なときだけタブ切替
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = TABS.indexOf(tab);
    if (dx < 0 && i < TABS.length - 1) setTab(TABS[i + 1]);
    else if (dx > 0 && i > 0) setTab(TABS[i - 1]);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 max-w-lg mx-auto">
      <Header tab={tab} setTab={setTab} />
      <main
        className="pb-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {tab === 'record' && <SessionRecorder machines={machines} onComplete={handleAdd} />}
        {tab === 'list' && (
          <RecordList records={records} machines={machines} onDelete={handleDelete} />
        )}
        {tab === 'machines' && (
          <MachineManager machines={machines} setMachines={setMachines} />
        )}
      </main>
    </div>
  );
}

export default App;
