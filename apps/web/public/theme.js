/* global localStorage, window, document */
// Pick the theme before first paint so the page never flashes the wrong one. A plain
// (blocking) script file rather than inline code, so the Content-Security-Policy can
// forbid inline scripts.
;(function () {
  try {
    var stored = localStorage.getItem('skillbridge_theme')
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch {
    // Storage can be blocked (private windows); the light theme is fine then.
  }
})()
