// Run before the first paint; an external script also respects the app's CSP.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('praxisraum-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Appearance remains usable when preference storage is unavailable. */ }
  const dark = preference === 'dark' || preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = preference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17211e' : '#467269');
})();
