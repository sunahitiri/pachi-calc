import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from './fixtures/dmm-5094.html?raw';
import { fetchDmmMachine, parseDmmHtml, parseSpec } from '../utils/dmmFetch.js';
import { normalizeDmmUrl } from '../utils/dmmUrl.js';
import { handleDmmRequest } from '../../server/dmm-proxy.js';

const SOURCE_URL = 'https://p-town.dmm.com/machines/5094';
const API_URL = 'https://pachi-calc-dmm.example.workers.dev';
const APP_ORIGIN = 'https://sunahitiri.github.io';
const SPEC = {
  name: 'e Re:ゼロから始める異世界生活 鬼がかり2',
  probability: 349.9,
  averagePayout: 5391,
  exchangeRate: 4,
  referenceBorder: 16.3,
  sourceUrl: SOURCE_URL,
};

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_DMM_PROXY_URL', API_URL);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DMM機種URLと解析', () => {
  it('5094の通常時確率と期待出玉を、右打ち確率や別の交換率と区別する', () => {
    expect(parseSpec(html, SOURCE_URL)).toEqual(SPEC);
  });

  it('共有URLの末尾スラッシュ・クエリ・フラグメントを取り除く', () => {
    expect(normalizeDmmUrl(` ${SOURCE_URL}/?share=1#spec `)).toBe(SOURCE_URL);
    expect(normalizeDmmUrl(SOURCE_URL.replace('https:', 'http:'))).toBe(SOURCE_URL);
  });

  it.each([
    '', 'not a url', 'https://example.com/machines/5094',
    'https://p-town.dmm.com.evil.example/machines/5094',
    'https://p-town.dmm.com@evil.example/machines/5094',
    'https://user:password@p-town.dmm.com/machines/5094',
    'https://p-town.dmm.com:444/machines/5094',
    'https://p-town.dmm.com/machines/5094/other',
  ])('機種ページ以外を取得しない: %s', (url) => {
    expect(() => normalizeDmmUrl(url)).toThrow();
  });

  it('エラーページをスペックとして保存しない', () => {
    expect(() => parseSpec('<h1>403 ERROR</h1>', SOURCE_URL)).toThrow('スペック情報');
  });

  it('500文字未満の表示テキストも手動で解析できる', () => {
    const text = '大当り確率 1/349.9 初当り1回あたりの期待出玉 5,391玉';
    expect(parseDmmHtml(text)).toMatchObject({ probability: 349.9, averagePayout: 5391 });
  });
});

describe('iPhoneの公開サイトから専用APIで取得', () => {
  it('ブラウザ→API→DMM→フォーム用スペックまで処理し、記録やCookieを送らない', async () => {
    localStorage.setItem('pachi-records', JSON.stringify([{ privateNote: 'record-data' }]));
    const upstream = vi.fn(async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const browserFetch = vi.fn((input, init) => handleDmmRequest(new Request(input, {
      ...init,
      headers: { ...init.headers, Origin: APP_ORIGIN },
    }), {}, upstream));
    vi.stubGlobal('fetch', browserFetch);

    expect(await fetchDmmMachine(`${SOURCE_URL}/?share=1`)).toEqual(SPEC);
    expect(browserFetch).toHaveBeenCalledWith(`${API_URL}/machines/5094`, expect.objectContaining({
      credentials: 'omit', headers: { Accept: 'application/json' },
    }));
    expect(upstream).toHaveBeenCalledWith(SOURCE_URL, expect.objectContaining({
      redirect: 'manual', headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'pachi-calc/1.0',
      },
    }));
    expect(JSON.stringify(browserFetch.mock.calls)).not.toContain('record-data');
    expect(await fetchDmmMachine(SOURCE_URL)).toEqual(SPEC);
    expect(browserFetch).toHaveBeenCalledTimes(1);
  });

  it('24時間を過ぎたキャッシュは取り直す', async () => {
    localStorage.setItem('pachi-dmm-spec-cache-v2', JSON.stringify({
      [SOURCE_URL]: { spec: SPEC, at: Date.now() - 25 * 60 * 60 * 1000 },
    }));
    const fetcher = vi.fn(async () => Response.json({ html, sourceUrl: SOURCE_URL }));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchDmmMachine(SOURCE_URL)).toEqual(SPEC);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('破損したキャッシュから回復する', async () => {
    localStorage.setItem('pachi-dmm-spec-cache-v2', 'null');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ html, sourceUrl: SOURCE_URL })));
    expect(await fetchDmmMachine(SOURCE_URL)).toEqual(SPEC);
  });

  it('公開API未設定なら他社プロキシへ送信せず設定エラーを表示する', async () => {
    vi.stubEnv('VITE_DMM_PROXY_URL', '');
    vi.stubEnv('DEV', false);
    vi.stubGlobal('location', { hostname: 'sunahitiri.github.io' });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(location.hostname).not.toBe('127.0.0.1');
    await expect(fetchDmmMachine(SOURCE_URL)).rejects.toThrow('まだ設定されていません');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('DMMの取得拒否をユーザーに知らせる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'DMMから取得できませんでした（HTTP 403）。' }, { status: 502 })));
    await expect(fetchDmmMachine(SOURCE_URL)).rejects.toThrow('HTTP 403');
  });

  it('機種番号が異なる応答を採用しない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ html, sourceUrl: 'https://p-town.dmm.com/machines/4457' })));
    await expect(fetchDmmMachine(SOURCE_URL)).rejects.toThrow('機種ページが正しくありません');
  });

  it('CORSや通信障害を接続エラーとして扱う', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchDmmMachine(SOURCE_URL)).rejects.toThrow('サーバーに接続できません');
  });
});

describe('取得APIの制限', () => {
  const request = (path = '/machines/5094', options = {}) => new Request(`${API_URL}${path}`, {
    headers: { Origin: APP_ORIGIN }, ...options,
  });

  it('許可したオリジンにだけCORSヘッダーを返す', async () => {
    const upstream = vi.fn(async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const response = await handleDmmRequest(request(), {}, upstream);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect((await response.json()).html).toBe(html);
  });

  it.each([undefined, 'https://evil.example'])('別サイトやオリジンのない要求からは取得しない: %s', async (origin) => {
    const upstream = vi.fn();
    const response = await handleDmmRequest(request('/machines/5094', { headers: origin ? { Origin: origin } : {} }), {}, upstream);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['/machines/5094?url=https://example.com', '/machines/5094/other', '/https://example.com', '/machines/abc'])('任意URLを中継しない: %s', async (path) => {
    const upstream = vi.fn();
    const response = await handleDmmRequest(request(path), {}, upstream);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('プリフライトではDMMに接続しない', async () => {
    const upstream = vi.fn();
    const response = await handleDmmRequest(request('/machines/5094', { method: 'OPTIONS' }), {}, upstream);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('POSTは受け付けない', async () => {
    const upstream = vi.fn();
    expect((await handleDmmRequest(request('/machines/5094', { method: 'POST' }), {}, upstream)).status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('DMMにページがない場合は404を返す', async () => {
    const response = await handleDmmRequest(request(), {}, vi.fn(async () => new Response('', { status: 404 })));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain('見つかりません');
  });

  it('転送先には接続せず、リダイレクトを取得エラーにする', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://example.com/' } }));
    const response = await handleDmmRequest(request(), {}, upstream);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('HTTP 302');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][1].redirect).toBe('manual');
  });

  it('一時的な403は1秒後に1回だけ再試行する', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const pending = handleDmmRequest(request(), {}, upstream);
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()).sourceUrl).toBe(SOURCE_URL);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('成功したページをAPI側に保存し、次の端末の取得ではDMMへ接続しない', async () => {
    let stored;
    const cache = {
      match: vi.fn(async () => stored?.clone()),
      put: vi.fn(async (_, response) => { stored = response; }),
    };
    vi.stubGlobal('caches', { default: cache });
    const upstream = vi.fn(async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const first = await handleDmmRequest(request(), {}, upstream);
    const second = await handleDmmRequest(request(), {}, upstream);
    expect((await first.json()).sourceUrl).toBe(SOURCE_URL);
    expect((await second.json()).html).toBe(html);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(stored.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(second.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
    expect(second.headers.get('Cache-Control')).toBe('no-store');
  });

  it('レート制限は再試行せず、失敗したページもキャッシュしない', async () => {
    const cache = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal('caches', { default: cache });
    const upstream = vi.fn(async () => new Response('Rate limited', { status: 429 }));
    const response = await handleDmmRequest(request(), {}, upstream);
    expect(response.status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('APIのタイムアウトでDMMへの通信を中断する', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn((_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = handleDmmRequest(request(), {}, upstream);
    await vi.advanceTimersByTimeAsync(15000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error).toContain('タイムアウト');
  });
});
