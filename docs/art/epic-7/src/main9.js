/* Page end: table of contents, pick table, fit, animation. */
{
  const toc = document.getElementById('toc');
  for (const s of sections) { const a = el('a', null, s.title); a.href = '#' + s.id; toc.appendChild(a); }
  savePicks();
  fitFrames();
  requestAnimationFrame(loop);
  markReady();
  document.getElementById('foot').innerHTML = 'Built from the game code on master by <code>docs/art/epic-7/src/build.mjs</code>. Add <code>?static</code> to stop the animations. Picks are kept in this browser only; "Copy my picks" puts them on the clipboard.';
}
