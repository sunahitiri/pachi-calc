import { normalizeDmmUrl } from './dmmUrl.js';

// HTMLをパースして機種スペックを抽出
export function parseSpec(html, sourceUrl = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();

  // 機種名: <title> から抽出（「（」より前）
  // jina-reader 経由の場合は HTML ではなく "Title: ○○" 行を含むテキストが来る
  const title =
    doc.querySelector('title')?.textContent ||
    html.match(/^Title:\s*(.+)$/m)?.[1] ||
    '';
  // 「・」は機種名自体に含まれることが多いので区切り文字にしない
  const name =
    title.split(/[（(|｜]/)[0]?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    '名称不明';

  // 大当たり確率: "大当り確率 1/349.9" / "大当り確率 約1/399" 形式
  // ラッキートリガー機などは「約1/399」と「約」が入るため非数字を許容する
  const probMatch = bodyText.match(
    /大当[たり]?り?確率[^\d\n]{0,20}?1\s*\/\s*(\d+(?:\.\d+)?)/
  );
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

// 同じ機種の連続取得は避け、翌日以降はDMMの最新内容を取得する。
const CACHE_KEY = 'pachi-dmm-spec-cache-v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 18000;

function readSpecCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  } catch {
    return {};
  }
}

function writeSpecCache(url, spec) {
  try {
    const cache = readSpecCache();
    cache[url] = { spec, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 保存できなくても取得した結果は利用できる。
  }
}

function getProxyBase() {
  const configured = import.meta.env.VITE_DMM_PROXY_URL?.trim();
  if (configured) {
    let url;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('自動取得サーバーのURLが正しく設定されていません。');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash) {
      throw new Error('自動取得サーバーにはHTTPSのURLを設定してください。');
    }
    return configured.replace(/\/+$/, '');
  }

  if (import.meta.env.DEV || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    return '/api/dmm';
  }
  throw new Error('自動取得サーバーがまだ設定されていません。設定が完了するまでは「手動貼り付け」を利用してください。');
}

export async function fetchDmmMachine(value) {
  const sourceUrl = normalizeDmmUrl(value);
  const cached = readSpecCache()[sourceUrl];
  if (cached?.at > Date.now() - CACHE_TTL_MS &&
      Number.isFinite(cached.spec?.probability) && cached.spec.probability > 0 &&
      Number.isFinite(cached.spec?.averagePayout) && cached.spec.averagePayout > 0 &&
      cached.spec.sourceUrl === sourceUrl) {
    return cached.spec;
  }

  const machineId = new URL(sourceUrl).pathname.split('/').pop();
  const endpoint = `${getProxyBase()}/machines/${machineId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(endpoint, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new Error(controller.signal.aborted
        ? '取得がタイムアウトしました。時間をおいて再試行してください。'
        : '自動取得サーバーに接続できません。通信環境を確認するか、「手動貼り付け」を利用してください。');
    }

    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('自動取得サーバーから正しい応答がありません。公開設定を確認してください。');
    }
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `取得に失敗しました（HTTP ${response.status}）。`);
    }
    if (typeof payload.html !== 'string' || payload.sourceUrl !== sourceUrl) {
      throw new Error('取得した機種ページが正しくありません。もう一度取得してください。');
    }
    const spec = parseSpec(payload.html, sourceUrl);
    writeSpecCache(sourceUrl, spec);
    return spec;
  } finally {
    clearTimeout(timeout);
  }
}

// 手動貼り付けは通信せず、端末内だけで解析する。
export function parseDmmHtml(html, sourceUrl = '') {
  if (!html || typeof html !== 'string' || !html.trim()) {
    throw new Error('ページの文章かHTMLソースを貼り付けてください。');
  }
  const canonicalUrl = sourceUrl.trim() ? normalizeDmmUrl(sourceUrl) : '';
  const spec = parseSpec(html, canonicalUrl);
  if (canonicalUrl) writeSpecCache(canonicalUrl, spec);
  return spec;
}
