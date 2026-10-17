const DMM_ORIGIN = 'https://p-town.dmm.com';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 入力されたURLやCookieは転送せず、固定ドメインの機種ページだけを読む。
    const upstream = await fetcher(sourceUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'pachi-calc/1.0',
      },
      // Workersはredirect: 'error'に未対応。転送先を追わず3xxを取得エラーにする。
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const error = upstream.status === 404
        ? 'DMMにこの機種ページが見つかりません。URLを確認してください。'
        : `DMMから取得できませんでした（HTTP ${upstream.status}）。時間をおいて再試行するか、手動貼り付けを利用してください。`;
      return json({ error }, upstream.status === 404 ? 404 : 502);
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
    return json({ html, sourceUrl });
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
