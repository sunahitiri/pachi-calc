export function normalizeDmmUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('URLを入力してください');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('DMM P-townの機種ページURLを入力してください');
  }

  const match = url.pathname.match(/^\/machines\/([1-9]\d*)\/?$/);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.hostname !== 'p-town.dmm.com' ||
    url.port || url.username || url.password || !match
  ) {
    throw new Error('DMM P-townの機種ページURL（https://p-town.dmm.com/machines/数字）を入力してください');
  }

  // 共有リンクのクエリやフラグメントは取得先へ送らない。
  return `https://p-town.dmm.com/machines/${match[1]}`;
}
