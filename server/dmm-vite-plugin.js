import { handleDmmRequest } from './dmm-proxy.js';

export function dmmProxyPlugin() {
  const configure = (server) => {
    server.middlewares.use('/api/dmm', async (req, res, next) => {
      try {
        const origin = new URL(`http://${req.headers.host}`);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
          res.writeHead(403).end();
          return;
        }
        // 別サイトからローカルAPIを呼び出す要求は受け付けない。
        const fetchSite = req.headers['sec-fetch-site'];
        if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
          res.writeHead(403).end();
          return;
        }

        const request = new Request(new URL(req.url, origin), {
          method: req.method,
          headers: { Origin: req.headers.origin || origin.origin },
        });
        const response = await handleDmmRequest(request, { ALLOWED_ORIGINS: origin.origin });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch (error) {
        next(error);
      }
    });
  };

  return {
    name: 'dmm-proxy',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
