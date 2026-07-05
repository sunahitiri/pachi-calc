// DMM P-townから機種スペックを自動取得
//
// 注意: p-town.dmm.com は CloudFront でデータセンターIPをブロックしているため、
// 一般的な公開CORSプロキシ経由の直接取得はほぼ 403 で失敗する。
// そのため以下の経路を全部同時に試し、最初にスペック抽出まで成功したものを採用する:
//   1. r.jina.ai      -- 実ブラウザでレンダリングして本文テキストを返すリーダー (CORS対応)
//   2. プロキシ→Wayback Machine のスナップショット (archive.org はプロキシを弾かない)
//   3. プロキシ→DMM 直接 (通ればラッキー程度の保険)

// CORSプロキシのラッパー (対象URLをプロキシ経由のURLへ変換)
const PROXY_WRAPPERS = [
  {
    name: 'allorigins',
    wrap: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  },
  {
    name: 'codetabs',
    wrap: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  },
];

const fetchText = async (fetchUrl, signal) => {
  const res = await fetch(fetchUrl, {
    signal,
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

// Wayback Machine のスナップショットをプロキシ経由で取得する。
// `web/2id_/` 形式のリダイレクトURLはプロキシが追ってくれない (空レスポンスになる) ため、
// まず available API で具体的なスナップショットURLを解決してから本体を取得する2段方式。
async function fetchViaWayback(wrap, url, signal) {
  const availJson = await fetchText(
    wrap(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`),
    signal
  );
  const snapUrl = JSON.parse(availJson)?.archived_snapshots?.closest?.url;
  if (!snapUrl) throw new Error('Waybackにスナップショットがありません');
  // id_ フラグで Wayback のツールバー無しの原本HTMLを取得
  const rawUrl = snapUrl
    .replace(/^http:/, 'https:')
    .replace(/\/web\/(\d+)\//, '/web/$1id_/');
  return fetchText(wrap(rawUrl), signal);
}

// 取得経路定義: { name, run(url, signal) -> Promise<htmlString> }
const SOURCES = [
  {
    name: 'jina-reader',
    run: (url, signal) => fetchText(`https://r.jina.ai/${url}`, signal),
  },
  ...PROXY_WRAPPERS.map((p) => ({
    name: `${p.name}→wayback`,
    run: (url, signal) => fetchViaWayback(p.wrap, url, signal),
  })),
  ...PROXY_WRAPPERS.map((p) => ({
    name: `${p.name}→dmm`,
    run: (url, signal) => fetchText(p.wrap(url), signal),
  })),
];

const URL_PATTERN = /^https?:\/\/p-town\.dmm\.com\/machines\/\d+/;

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

// 1経路あたりの待ち時間上限。ハングする経路を切り捨てる
const FETCH_TIMEOUT_MS = 20000;
// 再試行までの待ち時間 (レート制限に当たった場合に少し置いてから再試行)
const RETRY_DELAY_MS = 1500;

// 一度取得に成功したスペックの localStorage キャッシュ。
// 機種スペックは変わらないため、同じURLの再取得はネットワーク不要で即時成功させる。
const CACHE_KEY = 'pachi-dmm-spec-cache';

function readSpecCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
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
    // 容量超過等は無視 (キャッシュは必須ではない)
  }
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

  // 過去に成功したURLはキャッシュから即返す (スペックは不変)
  const cached = readSpecCache()[trimmed];
  if (cached?.spec) return cached.spec;

  // 全経路へ同時にリクエストし、最初にスペック抽出まで成功したものを採用する。
  // (逐次だと死んでいる経路1つで数十秒待たされるため)
  const controllers = SOURCES.map(() => new AbortController());
  const failures = [];

  const attempts = SOURCES.map(async (source, i) => {
    const controller = controllers[i];
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      let lastErr = null;
      // 無料プロキシは単発で失敗することが多いので、経路ごとに1回だけ再試行する
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          if (controller.signal.aborted) break;
        }
        try {
          const html = await source.run(trimmed, controller.signal);
          if (!html || html.length < 1000) {
            throw new Error(`レスポンスが空または短すぎ (${html?.length ?? 0}文字)`);
          }
          // エラーページ等を成功扱いしないよう、スペック抽出の成功までをこの経路の成功条件にする
          return parseSpec(html, trimmed);
        } catch (e) {
          lastErr = e;
          if (e?.name === 'AbortError') break;
          // 本文は取得できたのにスペックが無い場合は再試行しても無意味 (パチスロ機ページ等)
          if (String(e?.message || '').startsWith('スペック情報')) break;
        }
      }
      throw lastErr || new Error('中断されました');
    } catch (e) {
      const msg =
        e?.name === 'AbortError' ? `タイムアウト (${FETCH_TIMEOUT_MS / 1000}秒)` : e?.message || String(e);
      failures.push(`${source.name}: ${msg}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });

  try {
    const spec = await Promise.any(attempts);
    // 勝者が決まったら残りのリクエストは打ち切る
    controllers.forEach((c) => c.abort());
    writeSpecCache(trimmed, spec);
    return spec;
  } catch {
    const err = new Error(
      `全ての取得経路で失敗しました。\n${failures.join('\n')}\n\n💡 時間をおくか回線を切り替えて(Wi-Fi⇔モバイル)再試行してください。急ぐ場合はDMMページをブラウザで開いて「ページのソースを表示」→ 全選択コピー → 手動貼り付けで取り込めます。`
    );
    err.failures = failures;
    throw err;
  }
}

// 手動貼り付け用: HTMLとURL(任意)からスペック抽出
export function parseDmmHtml(html, sourceUrl = '') {
  if (!html || typeof html !== 'string' || html.length < 500) {
    throw new Error('HTMLが短すぎます。ページ全体のソースを貼り付けてください。');
  }
  const spec = parseSpec(html, sourceUrl);
  if (sourceUrl) writeSpecCache(sourceUrl.trim(), spec);
  return spec;
}
