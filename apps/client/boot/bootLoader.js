/* global window, document */
/* Story 10.4 (B6): the loading screen's script, inlined into index.html by vite.config.ts › bootLoaderPlugin (comments and
   indentation stripped; it must stay ≤ 2 KB and plain ES5: no eval, no dependency). `w.__BL_FILES` is the build's list of
   first-load files [path, gzip bytes] (absent in dev: no bar then). main.ts calls __bootLoader.phase("draw") once its code
   runs and __bootLoader.hide() at the first screen. */
(function (w, d) {
  var api = {
    // Bytes to show at t ms: the finished files, or a guess from the download rate (180 KB/s, Slow 4G, until 10 % has
    // landed), never above 98 % of the total until the files finish, never backwards.
    estimate: function (prev, done, total, t, tDone) {
      if (total <= 0) return prev;
      var rate = done >= total * 0.1 && tDone > 0 ? done / tDone : 180;
      return Math.min(Math.max(prev, done, Math.min(rate * t, total * 0.98)), total);
    },
    mb: function (b) {
      return (Math.round(b / 1e5) / 10).toFixed(1);
    },
    text: function (shown, total) {
      return "Downloading… " + api.mb(shown) + " / " + api.mb(total) + " MB";
    },
  };
  w.__bootLoader = api;
  var root = d.getElementById("boot-loader");
  if (!root) return;
  var fill = root.querySelector(".bl__fill");
  var line = root.querySelector(".bl__line");
  var files = w.__BL_FILES || [];
  var size = {};
  var total = 0;
  var done = 0;
  var tDone = 0;
  var shown = 0;
  var phase = "load";
  for (var i = 0; i < files.length; i++) {
    size[files[i][0]] = files[i][1];
    total += files[i][1];
  }
  function take(e) {
    var p = e.name.replace(/^[a-z]+:\/\/[^/]+/, "").split("?")[0];
    if (!size[p]) return;
    done += e.encodedBodySize > 0 ? Math.min(e.encodedBodySize, size[p] * 2) : size[p];
    size[p] = 0; // counted once
    if (done > total) total = done;
    tDone = Math.max(tDone, e.responseEnd || 0);
  }
  try {
    new w.PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var j = 0; j < es.length; j++) take(es[j]);
    }).observe({ type: "resource", buffered: true });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ES5 needs the binding
  } catch (err) {
    // no PerformanceObserver: the rate guess alone moves the bar
  }
  function draw() {
    if (phase !== "load" || total <= 0) return;
    shown = api.estimate(shown, done, total, w.performance.now(), tDone);
    fill.style.transform = "scaleX(" + shown / total + ")";
    line.textContent = api.text(done, total); // the text tells only what really landed; the guess moves the bar (review L1)
    root.setAttribute("data-progress", (shown / total).toFixed(3));
  }
  var timer = w.setInterval(draw, 100);
  draw();
  api.phase = function () {
    if (phase !== "load") return;
    phase = "draw";
    fill.style.transform = "scaleX(1)";
    line.textContent = "Drawing the city…";
    root.setAttribute("data-progress", "1");
  };
  api.hide = function () {
    phase = "gone";
    w.clearInterval(timer);
    if (root.parentNode) root.parentNode.removeChild(root);
  };
})(window, document);
