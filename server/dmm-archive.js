import { normalizeDmmUrl } from '../src/utils/dmmUrl.js';

const ARCHIVE_ORIGIN = 'https://web.archive.org';

// DMM本体の取得が拒否された場合だけ、同じ機種の公開保存版を取得する。
export async function fetchArchivedDmm(sourceUrl, signal, fetcher) {
  const indexUrl = new URL('/cdx/search/cdx', ARCHIVE_ORIGIN);
  indexUrl.searchParams.set('url', sourceUrl);
  indexUrl.searchParams.set('output', 'json');
  indexUrl.searchParams.set('filter', 'statuscode:200');
  indexUrl.searchParams.set('limit', '-1');
  const options = {
    signal,
    redirect: 'manual',
    headers: { 'User-Agent': 'pachi-calc/1.0', Accept: '*/*' },
  };
  const index = await fetcher(indexUrl.href, options);
  if (!index.ok) throw new Error(`保存版の検索に失敗しました（HTTP ${index.status}）。`);
  const rows = await index.json();
  const row = Array.isArray(rows) ? rows.at(-1) : null;
  const timestamp = row?.[1];
  const original = row?.[2];
  if (typeof timestamp !== 'string' || !/^\d{14}$/.test(timestamp) || typeof original !== 'string') {
    throw new Error('この機種の保存版は見つかりませんでした。');
  }
  let matchesSource = false;
  try {
    matchesSource = normalizeDmmUrl(original) === sourceUrl;
  } catch {
    // 公開アーカイブから返されたURLも、DMMの同じ機種に限定する。
  }
  if (!matchesSource) {
    throw new Error('保存版の機種URLが一致しません。');
  }

  const response = await fetcher(`${ARCHIVE_ORIGIN}/web/${timestamp}id_/${original}`, options);
  if (!response.ok) throw new Error(`保存版の取得に失敗しました（HTTP ${response.status}）。`);
  return { response, archiveTimestamp: timestamp };
}
