/* A short welcome once per tab session; the catalog loads independently. */
(() => {
  const overlay = document.getElementById('brandSplash');
  const shell = document.querySelector('.app-shell');
  if (!overlay || !shell) return;
  const key = 'aurevon.welcome.v1';
  let seen = false;
  try { seen = sessionStorage.getItem(key) === 'seen'; } catch (_) {}
  if (seen) return;
  const started = performance.now();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    shell.inert = false;
    overlay.hidden = true;
    overlay.classList.remove('is-leaving');
    document.removeEventListener('visibilitychange', visibility);
  };
  const visibility = () => { if (document.hidden) finish(); };
  // Install the escape timer before displaying or making the page inert.
  setTimeout(finish, 2300);
  try {
    try { sessionStorage.setItem(key, 'seen'); } catch (_) {}
    overlay.hidden = false;
    shell.inert = true;
    document.addEventListener('visibilitychange', visibility);
    setTimeout(() => {
      if (done) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
      overlay.classList.add('is-leaving');
      setTimeout(finish, 200);
    }, Math.max(0, 2000 - (performance.now() - started)));
  } catch (_) { finish(); }
})();
