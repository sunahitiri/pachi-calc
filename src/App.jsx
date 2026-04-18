import { useState } from 'react';
import Header from './components/Header';
import SessionRecorder from './components/SessionRecorder';
import RecordList from './components/RecordList';
import MachineManager from './components/MachineManager';
import { useLocalStorage } from './hooks/useLocalStorage';
import defaultMachines from './data/machines.json';

function App() {
  const [tab, setTab] = useState('record');
  const [records, setRecords] = useLocalStorage('pachi-records', []);
  const [machines, setMachines] = useLocalStorage('pachi-machines', defaultMachines);

  const handleAdd = (record) => {
    setRecords([record, ...records]);
    // セッション終了後は記録タブの開始画面に留まる
  };

  const handleDelete = (id) => {
    setRecords(records.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 max-w-lg mx-auto">
      <Header tab={tab} setTab={setTab} />
      <main className="pb-8">
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
