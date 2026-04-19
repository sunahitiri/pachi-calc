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

  const idx = TABS.indexOf(tab);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchRef = useRef(null);
  const containerRef = useRef(null);

  const handleAdd = (record) => {
    setRecords([record, ...records]);
    // セッション終了後は記録タブの開始画面に留まる
  };

  const handleDelete = (id) => {
    setRecords(records.filter((r) => r.id !== id));
  };

  const handleUpdate = (updated) => {
    setRecords(records.map((r) => (r.id === updated.id ? updated : r)));
  };

  // --- 指に追随するタブ切替 (iPhone ホーム画面風) ---
  const handleTouchStart = (e) => {
    // 入力要素/ボタン上のタッチは無視 (通常操作と競合させない)
    if (e.target.closest && e.target.closest('input,textarea,select,button,label')) {
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchRef.current = {
      x: t.clientX,
      y: t.clientY,
      t: Date.now(),
      locked: null, // 'x' | 'y' | null
      width: containerRef.current?.offsetWidth || window.innerWidth,
    };
  };

  const handleTouchMove = (e) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;

    // 初期の 8px で方向をロック (縦スクロール / 横スワイプを排他的に判定)
    if (!touchRef.current.locked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touchRef.current.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (touchRef.current.locked === 'x') setIsDragging(true);
      }
    }

    if (touchRef.current.locked === 'x') {
      // 端では引き戻し (ラバーバンド)
      let effDx = dx;
      if ((idx === 0 && dx > 0) || (idx === TABS.length - 1 && dx < 0)) {
        effDx = dx * 0.3;
      }
      setDragDx(effDx);
    }
  };

  const handleTouchEnd = () => {
    if (!touchRef.current) return;
    const { locked, t: startTime, width } = touchRef.current;
    touchRef.current = null;

    if (locked !== 'x') {
      setDragDx(0);
      setIsDragging(false);
      return;
    }

    const duration = Math.max(1, Date.now() - startTime);
    const velocity = dragDx / duration; // px/ms
    const distanceThreshold = width * 0.25;
    const velocityThreshold = 0.4; // px/ms (フリック判定)

    let newIdx = idx;
    if (
      (dragDx < -distanceThreshold || velocity < -velocityThreshold) &&
      idx < TABS.length - 1
    ) {
      newIdx = idx + 1;
    } else if (
      (dragDx > distanceThreshold || velocity > velocityThreshold) &&
      idx > 0
    ) {
      newIdx = idx - 1;
    }

    setIsDragging(false);
    setDragDx(0);
    if (newIdx !== idx) setTab(TABS[newIdx]);
  };

  return (
    <div className="h-screen flex flex-col max-w-lg mx-auto bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Header tab={tab} setTab={setTab} />
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className={`flex h-full ${
            isDragging ? '' : 'transition-transform duration-300 ease-out'
          }`}
          style={{
            width: `${TABS.length * 100}%`,
            transform: `translate3d(calc(${-idx * (100 / TABS.length)}% + ${dragDx}px), 0, 0)`,
          }}
        >
          <div
            className="flex-shrink-0 h-full overflow-y-auto pb-8"
            style={{ width: `${100 / TABS.length}%` }}
          >
            <SessionRecorder machines={machines} onComplete={handleAdd} />
          </div>
          <div
            className="flex-shrink-0 h-full overflow-y-auto pb-8"
            style={{ width: `${100 / TABS.length}%` }}
          >
            <RecordList
              records={records}
              machines={machines}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          </div>
          <div
            className="flex-shrink-0 h-full overflow-y-auto pb-8"
            style={{ width: `${100 / TABS.length}%` }}
          >
            <MachineManager machines={machines} setMachines={setMachines} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
