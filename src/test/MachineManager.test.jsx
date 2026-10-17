import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MachineManager from '../components/MachineManager.jsx';
import { fetchDmmMachine } from '../utils/dmmFetch';

vi.mock('../utils/dmmFetch', () => ({ fetchDmmMachine: vi.fn(), parseDmmHtml: vi.fn() }));

const spec = {
  name: 'e Re:ゼロから始める異世界生活 鬼がかり2',
  probability: 349.9, averagePayout: 5391, referenceBorder: 16.3,
  sourceUrl: 'https://p-town.dmm.com/machines/5094',
};

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);

describe('DMMからの機種取り込み', () => {
  it('保存版から取得した場合は日付と注意を表示し、機種のメモにも保存する', async () => {
    const setMachines = vi.fn();
    fetchDmmMachine.mockResolvedValue({ ...spec, archiveTimestamp: '20261008025917' });
    render(<MachineManager machines={[]} setMachines={setMachines} />);
    fireEvent.click(screen.getByRole('button', { name: '🔗 DMM' }));
    fireEvent.change(screen.getByPlaceholderText('https://p-town.dmm.com/machines/4457'), { target: { value: spec.sourceUrl } });
    fireEvent.click(screen.getByRole('button', { name: '自動取得' }));
    expect(await screen.findByRole('status')).toHaveTextContent('公開保存版（2026/10/08）');
    expect(screen.getByRole('status')).toHaveTextContent('最新情報と異なる場合');
    expect(screen.getByDisplayValue('5391')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '追加', exact: true }));
    expect(setMachines).toHaveBeenCalledWith([expect.objectContaining({
      name: spec.name, probability: 349.9, averagePayout: 5391,
      notes: expect.stringContaining('公開保存版 2026/10/08'),
    })]);
  });

  it('DMMから直接取得できた場合は保存版の注意を表示しない', async () => {
    fetchDmmMachine.mockResolvedValue(spec);
    render(<MachineManager machines={[]} setMachines={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '🔗 DMM' }));
    fireEvent.change(screen.getByPlaceholderText('https://p-town.dmm.com/machines/4457'), { target: { value: spec.sourceUrl } });
    fireEvent.click(screen.getByRole('button', { name: '自動取得' }));
    expect(await screen.findByDisplayValue('5391')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
