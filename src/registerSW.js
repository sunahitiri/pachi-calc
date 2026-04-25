// Service Worker の登録 + 自動更新リロード
// localStorage はこのコードでは一切触らないため、遊戯記録 (`pachi-records`) /
// 機種 (`pachi-machines`) / アクティブセッション (`pachi-active-session`) は
// アップデート後も保持される。
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // 開発時は HMR と競合するので登録しない
  if (import.meta.env.DEV) return;

  window.addEventListener('load', async () => {
    try {
      // base: './' でも相対パスで sw.js を解決
      const reg = await navigator.serviceWorker.register('./sw.js');

      // 1分毎に sw.js の更新チェック (アクティブ中の自動更新)
      setInterval(() => {
        reg.update().catch(() => {});
      }, 60 * 1000);

      // 起動直後と visibilitychange 復帰時にも更新チェック
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });

      // 初回インストール時 (controller がまだ無い) はリロード不要
      const wasControlled = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!wasControlled) return;
        if (reloaded) return;
        reloaded = true;
        // 新しい SW が制御を取った = 新しいデプロイがアクティブ化
        window.location.reload();
      });
    } catch (err) {
      // Service Worker 失敗時はサイレント (アプリは通常通り動作する)
      console.warn('SW registration failed:', err);
    }
  });
}
