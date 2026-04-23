import { describe, it, expect } from 'vitest';
import { sumHitBallsGained, recalcSession, finalSegmentInvestment } from '../utils/sessionUtils.js';

// ---- sumHitBallsGained ----

describe('sumHitBallsGained', () => {
  it('空配列 → 0', () => {
    expect(sumHitBallsGained([])).toBe(0);
  });

  it('nullまたはundefined → 0', () => {
    expect(sumHitBallsGained(null)).toBe(0);
    expect(sumHitBallsGained(undefined)).toBe(0);
  });

  it('単一ヒットの出玉を返す', () => {
    expect(sumHitBallsGained([{ ballsGained: 2400 }])).toBe(2400);
  });

  it('複数ヒットの出玉を合計する', () => {
    expect(sumHitBallsGained([{ ballsGained: 2400 }, { ballsGained: 1800 }])).toBe(4200);
  });

  it('ballsGainedが非数値の場合は0として扱う', () => {
    expect(sumHitBallsGained([{ ballsGained: 'abc' }, { ballsGained: 2400 }])).toBe(2400);
  });

  it('ballsGainedが0のヒットを正しく扱う', () => {
    expect(sumHitBallsGained([{ ballsGained: 0 }, { ballsGained: 1000 }])).toBe(1000);
  });
});

// ---- recalcSession ----

describe('recalcSession', () => {
  it('nullを渡すとnullを返す', () => {
    expect(recalcSession(null)).toBeNull();
  });

  it('undefinedを渡すとundefinedを返す', () => {
    expect(recalcSession(undefined)).toBeUndefined();
  });

  it('元のオブジェクトを変更しない (イミュータブル)', () => {
    const session = { startRotations: 100, startBalls: 0, hits: [] };
    const original = JSON.parse(JSON.stringify(session));
    recalcSession(session);
    expect(session).toEqual(original);
  });

  it('ヒットなしのセッション: cumulativeRotationsが0', () => {
    const session = {
      startRotations: 100,
      startBalls: 500,
      hits: [],
      currentRotations: 200,
      currentBalls: 300,
      totalInvestment: 5000,
    };
    const result = recalcSession(session);
    expect(result.cumulativeRotations).toBe(0);
    expect(result.segmentStartRotations).toBe(100);
  });

  it('ヒットなしのセッション: rotationsとinvestmentが更新される', () => {
    const session = {
      isSession: true,
      startRotations: 0,
      startBalls: 0,
      hits: [],
      currentRotations: 100,
      currentBalls: 0,
      totalInvestment: 5000,
    };
    const result = recalcSession(session);
    expect(result.rotations).toBe(100);
  });

  it('単一ヒットのsegmentRotを正しく計算する', () => {
    // startRotations=0, ヒット時=150回転 → segmentRot=150
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [
        {
          atMachineRot: 150,
          resumeMachineRot: 150,
          ballsAfter: 2400,
          addedInvestment: 5000,
        },
      ],
      totalInvestment: 5000,
    };
    const result = recalcSession(session);
    expect(result.hits[0].segmentRot).toBe(150);
    expect(result.hits[0].atCumulative).toBe(150);
  });

  it('単一ヒットのballsBefore/ballsGainedを正しく計算する', () => {
    const session = {
      startRotations: 0,
      startBalls: 500,
      hits: [
        {
          atMachineRot: 100,
          resumeMachineRot: 100,
          ballsAfter: 3000,
          addedInvestment: 3000,
        },
      ],
      totalInvestment: 3000,
    };
    const result = recalcSession(session);
    expect(result.hits[0].ballsBefore).toBe(500);
    expect(result.hits[0].ballsGained).toBe(2500); // 3000 - 500
  });

  it('複数ヒット: 各セグメントの累計回転数が正しい', () => {
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [
        { atMachineRot: 100, resumeMachineRot: 100, ballsAfter: 2400, addedInvestment: 3000 },
        { atMachineRot: 250, resumeMachineRot: 250, ballsAfter: 4800, addedInvestment: 4000 },
      ],
      totalInvestment: 7000,
    };
    const result = recalcSession(session);
    expect(result.hits[0].segmentRot).toBe(100);
    expect(result.hits[0].atCumulative).toBe(100);
    expect(result.hits[1].segmentRot).toBe(150); // 250 - 100
    expect(result.hits[1].atCumulative).toBe(250);
  });

  it('複数ヒット: 2回目のhitのballsBeforeは1回目のballsAfter', () => {
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [
        { atMachineRot: 100, resumeMachineRot: 100, ballsAfter: 2400, addedInvestment: 3000 },
        { atMachineRot: 200, resumeMachineRot: 200, ballsAfter: 4000, addedInvestment: 0 },
      ],
      totalInvestment: 3000,
    };
    const result = recalcSession(session);
    expect(result.hits[1].ballsBefore).toBe(2400);
    expect(result.hits[1].ballsGained).toBe(1600); // 4000 - 2400
  });

  it('atMachineRotがprevResumeより小さい場合はprevResumeにクランプされる', () => {
    const session = {
      startRotations: 200,
      startBalls: 0,
      hits: [
        { atMachineRot: 100, resumeMachineRot: 100, ballsAfter: 2400, addedInvestment: 0 },
      ],
      totalInvestment: 0,
    };
    const result = recalcSession(session);
    // atMachineRot(100) < startRotations(200) → クランプされて200
    expect(result.hits[0].atMachineRot).toBe(200);
    expect(result.hits[0].segmentRot).toBe(0);
  });

  it('hasEnd=true のとき endRotations/endBalls が更新される', () => {
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [],
      endRotations: 100,
      endBalls: 500,
      totalInvestment: 5000,
    };
    const result = recalcSession(session);
    expect(result.endRotations).toBe(100);
    expect(result.endBalls).toBe(500);
  });

  it('hasCurrent=true のとき currentRotations/currentBalls が更新される', () => {
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [],
      currentRotations: 80,
      currentBalls: 200,
      totalInvestment: 3000,
    };
    const result = recalcSession(session);
    expect(result.currentRotations).toBe(80);
    expect(result.currentBalls).toBe(200);
  });

  it('numOrFallback: 0 を入力しても 0 として扱われる (falsy トラップなし)', () => {
    // startBalls=0 は falsy だが 0 として扱われるべき
    const session = {
      startRotations: 0,
      startBalls: 0,
      hits: [
        { atMachineRot: 0, resumeMachineRot: 0, ballsAfter: 0, addedInvestment: 0 },
      ],
      totalInvestment: 0,
    };
    const result = recalcSession(session);
    expect(result.hits[0].ballsBefore).toBe(0);
    expect(result.startBalls).toBe(0);
  });
});

// ---- finalSegmentInvestment ----

describe('finalSegmentInvestment', () => {
  it('nullを渡すと0を返す', () => {
    expect(finalSegmentInvestment(null)).toBe(0);
  });

  it('ヒットなし: totalInvestmentをそのまま返す', () => {
    const session = { totalInvestment: 5000, hits: [] };
    expect(finalSegmentInvestment(session)).toBe(5000);
  });

  it('全額がヒット前: 残りは0', () => {
    const session = {
      totalInvestment: 5000,
      hits: [{ addedInvestment: 5000 }],
    };
    expect(finalSegmentInvestment(session)).toBe(0);
  });

  it('合計を差し引いた残りを返す', () => {
    const session = {
      totalInvestment: 10000,
      hits: [{ addedInvestment: 3000 }, { addedInvestment: 4000 }],
    };
    expect(finalSegmentInvestment(session)).toBe(3000);
  });

  it('ヒットのaddedInvestment合計がtotalInvestmentを超える場合は0にクランプ', () => {
    const session = {
      totalInvestment: 3000,
      hits: [{ addedInvestment: 5000 }],
    };
    expect(finalSegmentInvestment(session)).toBe(0);
  });

  it('hitsがundefinedでもtotalInvestmentを返す', () => {
    const session = { totalInvestment: 2000 };
    expect(finalSegmentInvestment(session)).toBe(2000);
  });
});
