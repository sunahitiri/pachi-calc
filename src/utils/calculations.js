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

// 参考: 機種のボーダー(1Kあたり回転数)を計算 = 「持ち玉ボーダー」
// 持ち玉だけで投資した場合の収支ゼロ点。1玉 = 4円 (玉貸し単価) として計算するので、
// exchangeRate には依存しない (= 等価の場合の現金ボーダーと一致)。
//
// 導出:
//   1000円分の持ち玉を投資 → 250玉 → R 回転
//   1回転あたりコスト(円) = 250 × 4 / R = 1000/R   (玉単価 4円換算)
//   1回転あたり期待収入(円) = hitRate × averagePayout × exchangeRate
//   ※ 収入は実際の換金レートを使うが、コスト側 (持ち玉) は 4円/玉 固定
//   破綻点: 1000/R = hitRate × averagePayout × exchangeRate
//   ⇒ R = 1000 / (hitRate × averagePayout × exchangeRate)
//
//   ……これは現金ボーダーと同じ式。実は「持ち玉ボーダー」と「現金ボーダー」が
//   分かれるのは、投資側を玉数 (250玉固定) で測るか円 (1000円固定) で測るかの
//   慣習の違いに依る。一般的なパチンコ理論では持ち玉ボーダーは「250玉あたりの
//   破綻回転数 = 250 / (hitRate × averagePayout)」で表現するためそちらを採用する。
export function calcBorder(machine) {
  if (!machine) return 0;
  const hitRate = 1 / machine.probability;
  const expectedBalls = hitRate * machine.averagePayout;
  if (expectedBalls <= 0) return 0;
  // 250玉あたり破綻回転数 (= 等価相当のボーダー)
  return 250 / expectedBalls;
}

// 時給1000円ボーダー: 200回転あたり期待値1000円を達成するための回転数/1K
// 200 × (income/rot - 1000/R) = 1000  ⇒  R = 1000 / (income/rot - 5)
export function calcHourlyBorder(machine) {
  if (!machine) return 0;
  const income = (1 / machine.probability) * machine.averagePayout * machine.exchangeRate;
  if (income <= 5) return 0;
  return 1000 / (income - 5);
}

// 総期待値(円)
export function calcExpectedValue({ totalRotations, investment, machine }) {
  if (!machine || !totalRotations || !investment) return 0;
  const perK = rotationsPer1K(totalRotations, investment);
  const evPerRotation = expectedValuePerRotation(perK, machine);
  return Math.round(evPerRotation * totalRotations);
}

// セッション記録の厳密期待値: 現金(4円)と持ち玉(exchangeRate)を区別してコスト計上
// record: { rotations, totalInvestment, startBalls, endBalls, hits, exchangeRate? }
// machine: { probability, averagePayout, exchangeRate }
export function calcSessionExpectedValue(record, machine) {
  if (!machine || !record) return 0;
  const BALL_RENTAL = 4;
  const rotations = Number(record.rotations) || 0;
  if (rotations <= 0) return 0;
  const exRate = record.exchangeRate ?? machine.exchangeRate ?? BALL_RENTAL;
  const totalInv = Number(record.totalInvestment ?? record.investment) || 0;
  const startBalls = Number(record.startBalls) || 0;
  const endBalls = Number(record.endBalls) || 0;
  const hitPayout = (record.hits || []).reduce((s, h) => s + (Number(h.ballsGained) || 0), 0);

  const cashBalls = totalInv / BALL_RENTAL;
  const totalConsumed = startBalls + cashBalls + hitPayout - endBalls;
  const cashConsumed = Math.max(0, Math.min(cashBalls, totalConsumed));
  const stockConsumed = Math.max(0, totalConsumed - cashConsumed);
  const cashCost = cashConsumed * BALL_RENTAL;
  const stockCost = stockConsumed * exRate;

  const incomePerRot = (1 / machine.probability) * machine.averagePayout * exRate;
  return Math.round(incomePerRot * rotations - cashCost - stockCost);
}

// 合計投資・回転数・期待値を集計
// セッション記録は厳密版(現金/持ち玉区別)で計算、それ以外は従来のperKベース
export function summarize(records, machines) {
  const machineMap = Object.fromEntries(machines.map((m) => [m.id, m]));
  return records.reduce(
    (acc, r) => {
      const machine = machineMap[r.machineId];
      acc.totalRotations += Number(r.rotations) || 0;
      acc.totalInvestment += Number(r.totalInvestment ?? r.investment) || 0;
      if (machine) {
        acc.totalExpectedValue += r.isSession
          ? calcSessionExpectedValue(r, machine)
          : calcExpectedValue({
              totalRotations: Number(r.rotations) || 0,
              investment: Number(r.investment) || 0,
              machine,
            });
      }
      return acc;
    },
    { totalRotations: 0, totalInvestment: 0, totalExpectedValue: 0 }
  );
}
