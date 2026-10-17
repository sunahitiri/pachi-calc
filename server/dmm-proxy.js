import { fetchArchivedDmm } from './dmm-archive.js';

const DMM_ORIGIN = 'https://p-town.dmm.com';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25000;

// Cloudflare Workers とローカルの Vite で同じ取得処理を使う。
export async function handleDmmRequest(request, env = {}, fetcher = globalThis.fetch.bind(globalThis)) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') {
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://sunahitiri.github.io')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

  if (!origin || !allowedOrigins.includes(origin)) {
    return json({ error: 'このサイトからの取得は許可されていません。' }, 403);
  }
  headers['Access-Control-Allow-Origin'] = origin;

  const match = url.pathname.match(/^\/machines\/([1-9]\d*)$/);
  if (!match || url.search) {
    return json({ error: '取得する機種ページが正しくありません。' }, 400);
  }

  if (request.method === 'OPTIONS') {
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Max-Age'] = '86400';
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'GET') {
    headers.Allow = 'GET, OPTIONS';
    return json({ error: 'GETで取得してください。' }, 405);
  }

  const sourceUrl = `${DMM_ORIGIN}/machines/${match[1]}`;
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}`);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const payload = await cached.json();
        if (payload.sourceUrl === sourceUrl && typeof payload.html === 'string') {
          return json(payload);
        }
      }
    } catch {
      // キャッシュに障害があってもDMMからの取得を試す。
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 入力されたURLやCookieは転送せず、固定ドメインの機種ページだけを読む。
    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      upstream = await fetcher(sourceUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'pachi-calc/1.0',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        },
        // Workersはredirect: 'error'に未対応。転送先を追わず3xxを取得エラーにする。
        redirect: 'manual',
        signal: controller.signal,
      });
      // 正常に取得できる公開ページでも一時的に403になることがある。
      // 再試行は1回に限定し、429（レート制限）は繰り返さない。
      if (attempt === 0 && [403, 502, 503, 504].includes(upstream.status)) {
        await upstream.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      break;
    }
    let archiveTimestamp;
    let archiveError;
    if ([403, 502, 503, 504].includes(upstream.status)) {
      await upstream.body?.cancel();
      try {
        const archived = await fetchArchivedDmm(sourceUrl, controller.signal, fetcher);
        upstream = archived.response;
        archiveTimestamp = archived.archiveTimestamp;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        const message = error instanceof Error ? error.message : '';
        archiveError = /^(保存版|この機種)/.test(message) ? message : '公開保存版にも接続できませんでした。';
      }
    }
    if (!upstream.ok) {
      const error = upstream.status === 404
        ? 'DMMにこの機種ページが見つかりません。URLを確認してください。'
        : `DMMから取得できませんでした（HTTP ${upstream.status}）。時間をおいて再試行するか、手動貼り付けを利用してください。`;
      return json({ error: archiveError ? `${error}\n${archiveError}` : error }, upstream.status === 404 ? 404 : 502);
    }

    const contentType = upstream.headers.get('Content-Type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return json({ error: 'DMMから機種ページ以外の応答が返りました。' }, 502);
    }
    if (Number(upstream.headers.get('Content-Length')) > MAX_HTML_BYTES) {
      return json({ error: '機種ページのサイズが大きすぎるため取得を中断しました。' }, 502);
    }

    const html = await upstream.text();
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
      return json({ error: '機種ページのサイズが大きすぎるため取得を中断しました。' }, 502);
    }
    // HTMLはJSONの文字列として返し、このAPI上では実行・表示しない。
    const payload = { html, sourceUrl, ...(archiveTimestamp ? { archiveTimestamp } : {}) };
    if (cache) {
      try {
        await cache.put(cacheKey, new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
        }));
      } catch {
        // キャッシュ保存の失敗を取得エラーにはしない。
      }
    }
    return json(payload);
  } catch (error) {
    console.warn('DMM fetch failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({
      error: controller.signal.aborted
        ? 'DMMの応答がタイムアウトしました。時間をおいて再試行してください。'
        : 'DMMへの接続に失敗しました。時間をおいて再試行するか、手動貼り付けを利用してください。',
    }, controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  fetch(request, env) {
    return handleDmmRequest(request, env);
  },
};
