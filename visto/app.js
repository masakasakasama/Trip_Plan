(async () => {
  const BUILD = '20260817g';
  const parts = [
    ...Array.from({ length: 11 }, (_, i) => `./parts/p${String(i + 1).padStart(2, '0')}.txt?v=${BUILD}`),
    `./parts/p13.txt?v=${BUILD}`,
    `./parts/p14.txt?v=${BUILD}`,
    `./parts/p15.txt?v=${BUILD}`,
    `./parts/p16.txt?v=${BUILD}`,
    `./parts/p17.txt?v=${BUILD}`,
    `./parts/p12.txt?v=${BUILD}`
  ];
  try {
    const sources = await Promise.all(parts.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.text();
    }));
    new Function(sources.join(''))();
  } catch (error) {
    console.error('Trip OS failed to load', error);
    const view = document.getElementById('view');
    if (view) view.innerHTML = '<div class="empty">アプリの読み込みに失敗しました。再読み込みしてください。</div>';
  }
})();
