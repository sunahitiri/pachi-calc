import { describe, it, expect } from 'vitest';
import {
  rotationsPer1K,
  expectedValuePerRotation,
  calcBorder,
  calcExpectedValue,
  calcSessionExpectedValue,
  summarize,
} from '../utils/calculations.js';

// テスト用機種データ (確率1/319、平均出玉2400、交換率3.57円)
const MACHINE = {
  id: 'm1',
  probability: 319,
  averagePayout: 2400,
  exchangeRate: 3.57,
};

// ---- rotationsPer1K ----

describe('rotationsPer1K', () => {
  it('1000円で20回転 → 20', () => {
    expect(rotationsPer1K(20, 1000)).toBe(20);
  });

  it('10000円で200回転 → 20', () => {
    expect(rotationsPer1K(200, 10000)).toBe(20);
  });

  it('投資0 → 0 (ゼロ除算ガード)', () => {
    expect(rotationsPer1K(100, 0)).toBe(0);
  });

  it('投資がnull → 0', () => {
    expect(rotationsPer1K(100, null)).toBe(0);
  });

  it('回転数0 → 0', () => {
    expect(rotationsPer1K(0, 1000)).toBe(0);
  });
});

// ---- expectedValuePerRotation ----

describe('expectedValuePerRotation', () => {
  it('正常な機種とperKで期待値を返す', () => {
    const perK = 20;
    const result = expectedValuePerRotation(perK, MACHINE);
    // income = (1/319) * 2400 * 3.57 ≈ 26.87
    // cost = 1000/20 = 50
    // ev = 26.87 - 50 ≈ -23.13
    expect(result).toBeCloseTo(-23.13, 1);
  });

  it('machineがnull → 0', () => {
    expect(expectedValuePerRotation(20, null)).toBe(0);
  });

  it('perKが0 → 0 (falsy ガードの動作確認)', () => {
    // perK=0 は falsy なので 0 を返す (既知の制約)
    expect(expectedValuePerRotation(0, MACHINE)).toBe(0);
  });

  it('perKがundefined → 0', () => {
    expect(expectedValuePerRotation(undefined, MACHINE)).toBe(0);
  });

  it('ボーダー付近の回転数でEVがほぼ0になる', () => {
    const border = calcBorder(MACHINE);
    const result = expectedValuePerRotation(border, MACHINE);
    expect(result).toBeCloseTo(0, 5);
  });
});

// ---- calcBorder ----

describe('calcBorder', () => {
  it('正常な機種でボーダーを計算する', () => {
    // border = 1000 / ((1/319) * 2400 * 3.57) ≈ 37.24
    const result = calcBorder(MACHINE);
    expect(result).toBeCloseTo(37.24, 1);
  });

  it('machineがnull → 0', () => {
    expect(calcBorder(null)).toBe(0);
  });

  it('machineがundefined → 0', () => {
    expect(calcBorder(undefined)).toBe(0);
  });

  it('exchangeRate=0 のとき income=0 → 0 を返す', () => {
    expect(calcBorder({ ...MACHINE, exchangeRate: 0 })).toBe(0);
  });
});

// ---- calcExpectedValue ----

describe('calcExpectedValue', () => {
  it('正常な入力で期待値を整数で返す', () => {
    const result = calcExpectedValue({ totalRotations: 100, investment: 5000, machine: MACHINE });
    expect(Number.isInteger(result)).toBe(true);
  });

  it('回転数が多いほど期待値(絶対値)が大きくなる', () => {
    const ev100 = calcExpectedValue({ totalRotations: 100, investment: 5000, machine: MACHINE });
    const ev200 = calcExpectedValue({ totalRotations: 200, investment: 10000, machine: MACHINE });
    // 同じperKなので回転数に比例する
    expect(Math.abs(ev200)).toBeCloseTo(Math.abs(ev100) * 2, 0);
  });

  it('machineがnull → 0', () => {
    expect(calcExpectedValue({ totalRotations: 100, investment: 5000, machine: null })).toBe(0);
  });

  it('totalRotationsが0 → 0', () => {
    expect(calcExpectedValue({ totalRotations: 0, investment: 5000, machine: MACHINE })).toBe(0);
  });

  it('investmentが0 → 0', () => {
    expect(calcExpectedValue({ totalRotations: 100, investment: 0, machine: MACHINE })).toBe(0);
  });
});

// ---- calcSessionExpectedValue ----

describe('calcSessionExpectedValue', () => {
  it('machineがnull → 0', () => {
    expect(calcSessionExpectedValue({}, null)).toBe(0);
  });

  it('recordがnull → 0', () => {
    expect(calcSessionExpectedValue(null, MACHINE)).toBe(0);
  });

  it('rotationsが0 → 0', () => {
    const record = { rotations: 0, totalInvestment: 5000, startBalls: 0, endBalls: 0, hits: [] };
    expect(calcSessionExpectedValue(record, MACHINE)).toBe(0);
  });

  it('ヒットなし・現金のみのセッションで期待値を返す', () => {
    // 100回転、5000円投資、持ち玉なし
    const record = {
      rotations: 100,
      totalInvestment: 5000,
      startBalls: 0,
      endBalls: 0,
      hits: [],
    };
    const result = calcSessionExpectedValue(record, MACHINE);
    expect(typeof result).toBe('number');
    expect(Number.isInteger(result)).toBe(true);
    // コスト=5000円、収入=(1/319)*2400*3.57*100≈2687円 → 負の期待値
    expect(result).toBeLessThan(0);
  });

  it('ヒットあり・出玉で回すセッションで期待値を返す', () => {
    const record = {
      rotations: 200,
      totalInvestment: 5000,
      startBalls: 0,
      endBalls: 1000,
      hits: [{ ballsGained: 2400 }],
    };
    const result = calcSessionExpectedValue(record, MACHINE);
    expect(typeof result).toBe('number');
  });

  it('record.exchangeRateがmachine.exchangeRateより優先される', () => {
    const record = {
      rotations: 100,
      totalInvestment: 5000,
      startBalls: 0,
      endBalls: 0,
      hits: [],
      exchangeRate: 4,
    };
    const resultWithRecordRate = calcSessionExpectedValue(record, MACHINE);
    const resultWithMachineRate = calcSessionExpectedValue(
      { ...record, exchangeRate: undefined },
      MACHINE
    );
    // 交換率が違うので結果が違うはず
    expect(resultWithRecordRate).not.toBe(resultWithMachineRate);
  });
});

// ---- summarize ----

describe('summarize', () => {
  it('空の配列 → すべて0', () => {
    const result = summarize([], [MACHINE]);
    expect(result).toEqual({ totalRotations: 0, totalInvestment: 0, totalExpectedValue: 0 });
  });

  it('machines配列が空でも回転数・投資は集計される', () => {
    const records = [{ rotations: 100, investment: 5000, machineId: 'm1' }];
    const result = summarize(records, []);
    expect(result.totalRotations).toBe(100);
    expect(result.totalInvestment).toBe(5000);
    // machineが見つからないのでEVは0
    expect(result.totalExpectedValue).toBe(0);
  });

  it('通常記録(isSession=false)を集計する', () => {
    const records = [
      { rotations: 100, investment: 5000, machineId: 'm1' },
      { rotations: 50, investment: 2000, machineId: 'm1' },
    ];
    const result = summarize(records, [MACHINE]);
    expect(result.totalRotations).toBe(150);
    expect(result.totalInvestment).toBe(7000);
    expect(typeof result.totalExpectedValue).toBe('number');
  });

  it('セッション記録(isSession=true)を厳密EVで集計する', () => {
    const records = [
      {
        isSession: true,
        rotations: 100,
        totalInvestment: 5000,
        startBalls: 0,
        endBalls: 0,
        hits: [],
        machineId: 'm1',
      },
    ];
    const result = summarize(records, [MACHINE]);
    expect(result.totalRotations).toBe(100);
    expect(result.totalInvestment).toBe(5000);
    expect(typeof result.totalExpectedValue).toBe('number');
  });

  it('machineIdが不明なレコードはEVを0としてスキップ', () => {
    const records = [{ rotations: 100, investment: 5000, machineId: 'unknown' }];
    const result = summarize(records, [MACHINE]);
    expect(result.totalExpectedValue).toBe(0);
  });

  it('totalInvestmentとinvestmentを両方サポートする', () => {
    const r1 = [{ rotations: 100, investment: 5000, machineId: 'm1' }];
    const r2 = [{ rotations: 100, totalInvestment: 5000, machineId: 'm1' }];
    const result1 = summarize(r1, [MACHINE]);
    const result2 = summarize(r2, [MACHINE]);
    expect(result1.totalInvestment).toBe(result2.totalInvestment);
  });
});
