/**

 * FPS chip + F12 nerd panel (frame time, draw calls, memory).

 * GPU/thermals: shown as N/A (browser) — not inventable from JS.

 */



/**

 * @param {object} opts

 * @param {() => { renderer?: import('three').WebGLRenderer, running?: boolean }} opts.getThree

 * @param {HTMLElement} [opts.host] stage or document body

 * @param {boolean} [opts.startOpen=false]

 */

export function createNerdOverlay(opts = {}) {

  const host = opts.host || document.body;

  const root = document.createElement("div");

  root.className = "nerd-overlay";

  root.innerHTML = `

    <button type="button" class="nerd-fps" data-nerd-fps title="Click or F12 for nerd panel">-- FPS</button>

    <div class="nerd-panel" data-nerd-panel hidden>

      <header class="nerd-panel-head">

        <strong>Nerd / Perf</strong>

        <button type="button" class="btn" data-nerd-close>Close</button>

      </header>

      <div class="nerd-stats">

        <div><span>FPS</span><b data-nerd-fps-val>—</b></div>

        <div><span>Frame</span><b data-nerd-ft>—</b></div>

        <div><span>CPU frame</span><b data-nerd-cpu>—</b></div>

        <div><span>Draw calls</span><b data-nerd-calls>—</b></div>

        <div><span>Triangles</span><b data-nerd-tris>—</b></div>

        <div><span>Geometries</span><b data-nerd-geos>—</b></div>

        <div><span>Textures</span><b data-nerd-tex>—</b></div>

        <div><span>JS heap</span><b data-nerd-mem>—</b></div>

        <div><span>GPU / thermals</span><b>N/A (browser)</b></div>

      </div>

      <canvas class="nerd-graph" data-nerd-graph width="220" height="48"></canvas>

      <p class="forge-tag">F12 toggles · FPS always visible</p>

    </div>

  `;

  host.appendChild(root);



  const fpsBtn = root.querySelector("[data-nerd-fps]");

  const panel = root.querySelector("[data-nerd-panel]");

  const graph = root.querySelector("[data-nerd-graph]");

  const el = (sel) => root.querySelector(sel);



  let open = !!opts.startOpen;

  panel.hidden = !open;



  const samples = [];

  const MAX = 60;

  let frames = 0;

  let lastFpsAt = performance.now();

  let fps = 0;

  let lastFrame = performance.now();

  let frameMs = 0;

  let cpuMs = 0;



  function setOpen(on) {

    open = !!on;

    panel.hidden = !open;

  }



  function toggle() {

    setOpen(!open);

  }



  fpsBtn.addEventListener("click", toggle);

  el("[data-nerd-close]")?.addEventListener("click", () => setOpen(false));



  function onKey(e) {

    if (e.key === "F12") {

      e.preventDefault();

      toggle();

    }

  }

  window.addEventListener("keydown", onKey);



  function drawGraph() {

    const ctx = graph.getContext("2d");

    const w = graph.width;

    const h = graph.height;

    ctx.fillStyle = "#0c0e0a";

    ctx.fillRect(0, 0, w, h);

    if (samples.length < 2) return;

    const max = Math.max(33, ...samples);

    ctx.strokeStyle = "#c4e070";

    ctx.beginPath();

    samples.forEach((v, i) => {

      const x = (i / (MAX - 1)) * (w - 1);

      const y = h - 2 - (v / max) * (h - 4);

      if (i === 0) ctx.moveTo(x, y);

      else ctx.lineTo(x, y);

    });

    ctx.stroke();

  }



  /**

   * Call once per animation frame from the host render loop.

   * @param {number} [cpuFrameMs] optional measured CPU work for the frame

   */

  function tick(cpuFrameMs) {

    const now = performance.now();

    frameMs = now - lastFrame;

    lastFrame = now;

    if (Number.isFinite(cpuFrameMs)) cpuMs = cpuFrameMs;

    else cpuMs = frameMs;



    frames += 1;

    if (now - lastFpsAt >= 500) {

      fps = Math.round((frames * 1000) / (now - lastFpsAt));

      frames = 0;

      lastFpsAt = now;

      fpsBtn.textContent = `${fps} FPS`;

    }



    samples.push(frameMs);

    if (samples.length > MAX) samples.shift();



    if (!open) return;



    el("[data-nerd-fps-val]").textContent = String(fps);

    el("[data-nerd-ft]").textContent = `${frameMs.toFixed(1)} ms`;

    el("[data-nerd-cpu]").textContent = `${cpuMs.toFixed(1)} ms`;



    const three = opts.getThree?.() || {};

    const info = three.renderer?.info;

    if (info) {

      el("[data-nerd-calls]").textContent = String(info.render?.calls ?? "—");

      el("[data-nerd-tris]").textContent = String(info.render?.triangles ?? "—");

      el("[data-nerd-geos]").textContent = String(info.memory?.geometries ?? "—");

      el("[data-nerd-tex]").textContent = String(info.memory?.textures ?? "—");

    } else {

      el("[data-nerd-calls]").textContent = "—";

      el("[data-nerd-tris]").textContent = "—";

      el("[data-nerd-geos]").textContent = "—";

      el("[data-nerd-tex]").textContent = "—";

    }



    const mem = performance.memory;

    if (mem) {

      const used = (mem.usedJSHeapSize / 1048576).toFixed(1);

      const total = (mem.totalJSHeapSize / 1048576).toFixed(1);

      el("[data-nerd-mem]").textContent = `${used} / ${total} MB`;

    } else {

      el("[data-nerd-mem]").textContent = "N/A (browser)";

    }



    drawGraph();

  }



  function dispose() {

    window.removeEventListener("keydown", onKey);

    root.remove();

  }



  function setVisible(on) {
    root.hidden = !on;
    if (!on) setOpen(false);
  }

  function getVisible() {
    return !root.hidden;
  }

  return {
    tick,
    toggle,
    setOpen,
    setVisible,
    getVisible,
    dispose,
    get fps() {
      return fps;
    },
  };

}


