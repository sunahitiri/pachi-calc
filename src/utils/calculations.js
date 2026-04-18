// パチンコ期待値計算ユーティリティ
//
// 計算モデル:
//   1回転の期待出玉 = 初当たり確率 × 平均出玉(連チャン込み)
//   1回転の期待収入(円) = 1回転の期待出玉 × 交換率
//   1回転のコスト(円) = 1000 / 1Kあたり実回転数
//   1回転の期待値(円) = 期待収入 - コスト
//   総期待値 = 1回転の期待値 × 総回転数

// 1000円あたりの回転数
export function rotationsPer1K(totalRotations, investment) {
  if (!investment || investment <= 0) return 0;
  return (totalRotations * 1000) / investment;
}

// 1回転の期待値(円)
export function expectedValuePerRotation(perK, machine) {
  if (!machine || !perK) return 0;
  // probability: 初当たり確率の分母 (例: 319 なら 1/319)
  const hitRate = 1 / machine.probability;
  const expectedBalls = hitRate * machine.averagePayout;
  const income = expectedBalls * machine.exchangeRate;
  const costPerRotation = 1000 / perK;
  return income - costPerRotation;
}

// 参考: 機種のボーダー(1Kあたり回転数)を計算
// ボーダー = 1回転コスト = 1回転期待収入 のときの1Kあたり回転数
// 1000/perK = hitRate × averagePayout × exchangeRate
// perK = 1000 / (hitRate × averagePayout × exchangeRate)
export function calcBorder(machine) {
  if (!machine) return 0;
  const hitRate = 1 / machine.probability;
  const income = hitRate * machine.averagePayout * machine.exchangeRate;
  if (income <= 0) return 0;
  return 1000 / income;
}

// 総期待値(円)
export function calcExpectedValue({ totalRotations, investment, machine }) {
  if (!machine || !totalRotations || !investment) return 0;
  const perK = rotationsPer1K(totalRotations, investment);
  const evPerRotation = expectedValuePerRotation(perK, machine);
  return Math.round(evPerRotation * totalRotations);
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
