// パチンコ期待値計算ユーティリティ

// 1000円あたりの回転数を計算
export function rotationsPer1K(totalRotations, investment) {
  if (!investment || investment <= 0) return 0;
  return (totalRotations * 1000) / investment;
}

// 期待値を計算
// 基本式: 期待値 = (実回転数/1K - ボーダー) × 投資額 / 1000 × 調整係数
// ※ 実際の期待値は機種ごとのvaluePerRotationを使って概算
export function calcExpectedValue({ totalRotations, investment, machine }) {
  if (!machine || !totalRotations || !investment) return 0;
  const perK = rotationsPer1K(totalRotations, investment);
  const delta = perK - machine.border;
  // 1K差分あたりの価値: 回転数差 × (投資額/1000) × 回転価値
  return Math.round(delta * (investment / 1000) * machine.valuePerRotation);
}

// 時給期待値（プレイ時間から算出）
export function calcHourlyExpectedValue(expectedValue, minutes) {
  if (!minutes || minutes <= 0) return 0;
  return Math.round((expectedValue * 60) / minutes);
}

// 合計投資・回転数・期待値を集計
export function summarize(records, machines) {
  const machineMap = Object.fromEntries(machines.map((m) => [m.id, m]));
  return records.reduce(
    (acc, r) => {
      const machine = machineMap[r.machineId];
      acc.totalRotations += Number(r.rotations) || 0;
      acc.totalInvestment += Number(r.investment) || 0;
      acc.totalExpectedValue += machine
        ? calcExpectedValue({
            totalRotations: Number(r.rotations) || 0,
            investment: Number(r.investment) || 0,
            machine,
          })
        : 0;
      return acc;
    },
    { totalRotations: 0, totalInvestment: 0, totalExpectedValue: 0 }
  );
}
