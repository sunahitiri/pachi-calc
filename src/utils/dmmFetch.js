// DMM P-townから機種スペックを自動取得
// CORSを回避するため公開プロキシを利用

const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

const URL_PATTERN = /^https?:\/\/p-town\.dmm\.com\/machines\/\d+/;

// HTMLをパースして機種スペックを抽出
function parseSpec(html, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();

  // 機種名: <title> から抽出（「（」より前）
  const title = doc.querySelector('title')?.textContent || '';
  const name =
    title.split(/[（(・|｜]/)[0]?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    '名称不明';

  // 大当たり確率: "大当り確率 1/349.9" 形式
  const probMatch = bodyText.match(/大当り確率\s*1\/(\d+(?:\.\d+)?)/);
  const probability = probMatch ? parseFloat(probMatch[1]) : null;

  // 初当り期待出玉: "初当り1回あたりの期待出玉 ... 5,282玉"
  const payoutMatch = bodyText.match(
    /初当り1回あたりの期待出玉[\s\S]{0,300}?([\d,]+)\s*玉/
  );
  const averagePayout = payoutMatch
    ? parseInt(payoutMatch[1].replace(/,/g, ''), 10)
    : null;

  // ボーダー(参考): "4.0円(25個) ... 16.6回転"
  const borderMatch = bodyText.match(
    /4\.0\s*円[^0-9]*?\d+\s*個[^0-9]*?(\d+(?:\.\d+)?)\s*回転/
  );
  const border4yen = borderMatch ? parseFloat(borderMatch[1]) : null;

  if (!probability || !averagePayout) {
    throw new Error(
      'スペック情報を抽出できませんでした。HTML構造が変わった可能性があります。'
    );
  }

  return {
    name,
    probability,
    averagePayout,
    exchangeRate: 4,
    referenceBorder: border4yen,
    sourceUrl,
  };
}

// 公開プロキシを順番に試す
async function fetchHtml(url) {
  let lastError;
  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy(url);
      const res = await fetch(proxyUrl, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (html && html.length > 1000) return html;
      throw new Error('レスポンスが空または短すぎます');
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('全てのプロキシで取得失敗しました');
}

export async function fetchDmmMachine(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URLを入力してください');
  }
  const trimmed = url.trim();
  if (!URL_PATTERN.test(trimmed)) {
    throw new Error(
      'DMM P-townの機種ページURL（https://p-town.dmm.com/machines/数字）を入力してください'
    );
  }
  const html = await fetchHtml(trimmed);
  return parseSpec(html, trimmed);
}
