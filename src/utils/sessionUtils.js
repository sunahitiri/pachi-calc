// セッション (進行中 / 完了済み記録) の派生フィールドを再計算するユーティリティ
//
// 編集可能なベースフィールド:
//   - startRotations, startBalls
//   - hits[i].atMachineRot, hits[i].resumeMachineRot, hits[i].ballsBefore, hits[i].ballsAfter,
//     hits[i].addedInvestment
//   - endRotations / endBalls (完了済み記録) または currentRotations / currentBalls (進行中)
//   - totalInvestment (= Σ hits[].addedInvestment + 最終セグメントの追加投資)
//
// 派生フィールド (自動計算):
//   - hits[i].ballsGained, hits[i].segmentRot, hits[i].atCumulative
//   - cumulativeRotations, segmentStartRotations
//   - rotations (累計回転), investment (累計投資) -- RecordList サマリ互換
//
// ※ hits[i].ballsBefore は「あたり時の持ち玉」を指す独立保存フィールド。
//   保存値があればそれを使い、無い場合のみ前段の ballsAfter (または startBalls) にフォールバック。
//   これにより「前のあたり後の持ち玉」と「次のあたり時の持ち玉」を個別に編集できる。

const BALL_VALUE = 4; // 1玉 = 4円

// `Number(x) || fallback` は 0 を falsy 扱いしてしまい、ユーザーが 0 を入力しても
// fallback に戻されて「編集が効かない」状態になる。空/NaN のときだけ fallback に落ちる版。
function numOrFallback(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function sumHitBallsGained(hits) {
  return (hits || []).reduce((s, h) => s + (Number(h.ballsGained) || 0), 0);
}

// 現金投資額から「あたり以外で得た持ち玉分」を差し引いた累計投資
// = 実質的に打ち込んだ球の円換算コスト
function cumulativeInvestment(totalInvestment, startBalls, endBalls, hitBallsGained) {
  const nonHitBallsDelta = (endBalls - startBalls) - hitBallsGained;
  return totalInvestment - nonHitBallsDelta * BALL_VALUE;
}

// セッション/記録を受け取り、派生フィールドを再計算した新しいオブジェクトを返す。
// 元のオブジェクトは変更しない (イミュータブル)。
export function recalcSession(session) {
  if (!session) return session;

  const startRotations = Math.max(0, numOrFallback(session.startRotations, 0));
  const startBalls = Math.max(0, numOrFallback(session.startBalls, 0));

  const hits = [];
  let prevResume = startRotations;
  let prevBalls = startBalls;
  let cumulative = 0;

  for (const h of session.hits || []) {
    const atMachineRot = Math.max(prevResume, numOrFallback(h.atMachineRot, prevResume));
    const resumeMachineRot = Math.max(0, numOrFallback(h.resumeMachineRot, 0));
    const ballsAfter = Math.max(0, numOrFallback(h.ballsAfter, 0));
    const addedInvestment = Math.max(0, numOrFallback(h.addedInvestment, 0));

    const segmentRot = Math.max(0, atMachineRot - prevResume);
    cumulative += segmentRot;
    // ballsBefore は独立保存フィールド。保存値があればそれを尊重し (個別編集可)、
    // 値が無いときのみ前段 (= prevBalls) にフォールバックする。
    const ballsBefore =
      h.ballsBefore !== undefined && h.ballsBefore !== null && h.ballsBefore !== ''
        ? Math.max(0, numOrFallback(h.ballsBefore, prevBalls))
        : prevBalls;
    const ballsGained = ballsAfter - ballsBefore;

    hits.push({
      ...h,
      atMachineRot,
      resumeMachineRot,
      ballsBefore,
      ballsAfter,
      ballsGained,
      segmentRot,
      atCumulative: cumulative,
      addedInvestment,
    });

    prevResume = resumeMachineRot;
    prevBalls = ballsAfter;
  }

  const updated = {
    ...session,
    startRotations,
    startBalls,
    hits,
    cumulativeRotations: cumulative,
    segmentStartRotations: prevResume,
  };

  // 終了/現在の state をもとに rotations / investment を更新
  // - 完了済み記録は endRotations / endBalls を持つ
  // - 進行中セッションは currentRotations / currentBalls を持つ
  const hasEnd = session.endRotations != null || session.endBalls != null;
  const hasCurrent = session.currentRotations != null || session.currentBalls != null;

  const endRot = Math.max(
    prevResume,
    numOrFallback(session.endRotations ?? session.currentRotations, prevResume)
  );
  const endBalls = Math.max(
    0,
    numOrFallback(session.endBalls ?? session.currentBalls, prevBalls)
  );
  const totalInvestment = Math.max(0, numOrFallback(session.totalInvestment, 0));

  const currentSegRot = Math.max(0, endRot - prevResume);
  const totalRot = cumulative + currentSegRot;
  const hitPayout = sumHitBallsGained(hits);
  const cumInv = cumulativeInvestment(totalInvestment, startBalls, endBalls, hitPayout);

  if (hasEnd) {
    updated.endRotations = endRot;
    updated.endBalls = endBalls;
  }
  if (hasCurrent) {
    updated.currentRotations = endRot;
    updated.currentBalls = endBalls;
  }
  updated.totalInvestment = totalInvestment;

  // RecordList の summary と互換の累計フィールド
  if (session.isSession || hasEnd) {
    updated.rotations = Math.max(0, totalRot);
    updated.investment = Math.max(0, Math.round(cumInv));
  }

  return updated;
}

// セッション末尾の投資 = totalInvestment − Σ hits[].addedInvestment
// (最後のあたり以降、現時点までに追加した投資)
export function finalSegmentInvestment(session) {
  if (!session) return 0;
  const total = Number(session.totalInvestment) || 0;
  const sum = (session.hits || []).reduce(
    (s, h) => s + (Number(h.addedInvestment) || 0),
    0
  );
  return Math.max(0, total - sum);
}
