// DMM P-townから機種スペックを自動取得
// CORSを回避するため複数の公開プロキシを順番に試す

// プロキシ定義: { name, build(url) -> proxyUrl, extract(response) -> Promise<htmlString> }
const PROXIES = [
  {
    name: 'allorigins',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    extract: (res) => res.text(),
  },
  {
    name: 'allorigins-get',
    build: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    extract: async (res) => {
      const json = await res.json();
      return json?.contents || '';
    },
  },
  {
    name: 'codetabs',
    build: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
    extract: (res) => res.text(),
  },
  {
    name: 'corsproxy.io',
    build: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    extract: (res) => res.text(),
  },
  {
    name: 'thingproxy',
    build: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    extract: (res) => res.text(),
  },
];

const URL_PATTERN = /^https?:\/\/p-town\.dmm\.com\/machines\/\d+/;

// HTMLをパースして機種スペックを抽出
export function parseSpec(html, sourceUrl = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();

  // 機種名: <title> から抽出（「（」より前）
  const title = doc.querySelector('title')?.textContent || '';
  const name =
    title.split(/[（(・|｜]/)[0]?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    '名称不明';

  // 大当たり確率: "大当り確率 1/349.9" 形式
  const probMatch = bodyText.match(/大当[たり]?り?確率\s*1\/(\d+(?:\.\d+)?)/);
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

// 複数プロキシを順番に試す。全プロキシの失敗理由をまとめてエラーに含める。
async function fetchHtml(url) {
  const failures = [];
  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy.build(url);
      const res = await fetch(proxyUrl, {
        headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
      });
      if (!res.ok) {
        failures.push(`${proxy.name}: HTTP ${res.status}`);
        continue;
      }
      const html = await proxy.extract(res);
      if (html && html.length > 1000) return html;
      failures.push(`${proxy.name}: レスポンスが空または短すぎ (${html?.length ?? 0}文字)`);
    } catch (e) {
      failures.push(`${proxy.name}: ${e.message || e}`);
    }
  }
  const err = new Error(
    `全てのプロキシで取得に失敗しました。\n${failures.join('\n')}\n\n💡 DMMページをブラウザで開いて「ページのソースを表示」→ 全選択コピー → 手動貼り付けで取り込めます。`
  );
  err.failures = failures;
  throw err;
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

// 手動貼り付け用: HTMLとURL(任意)からスペック抽出
export function parseDmmHtml(html, sourceUrl = '') {
  if (!html || typeof html !== 'string' || html.length < 500) {
    throw new Error('HTMLが短すぎます。ページ全体のソースを貼り付けてください。');
  }
  return parseSpec(html, sourceUrl);
}
