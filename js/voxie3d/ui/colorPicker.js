/**

 * Solid left-panel color picker: SV square + hue bar, RGB/hex/V integers, live swatch.

 * Matches placed color exactly (no lighting/noise in the preview).

 */



import {

  hsbToHex,

  hsbToRgb,

  hexToHsb,

  hexToRgb,

  rgbToHsb,

  normalizeHex,

  clamp,

} from "../color/hsb.js";



/**

 * @param {object} voxie

 * @param {HTMLElement} host

 */

export function bindColorPicker(voxie, host) {

  if (!host) return { dispose() {}, sync() {} };



  host.innerHTML = `
    <div class="cpick">
      <div class="cpick-swatch" data-cpick-swatch title="Placed color preview"></div>
      <div class="cpick-sv-wrap">
        <canvas class="cpick-sv" data-cpick-sv width="160" height="120"></canvas>
        <div class="cpick-sv-cursor" data-cpick-sv-cursor></div>
      </div>
      <canvas class="cpick-hue" data-cpick-hue width="160" height="14"></canvas>
      <div class="cpick-rgb-block" data-cpick-rgb-block>
        <div class="cpick-rgb-title">RGB</div>
        <div class="cpick-fields cpick-rgb">
          <label>R <input type="number" min="0" max="255" step="1" data-cpick-r title="Red 0–255" /></label>
          <label>G <input type="number" min="0" max="255" step="1" data-cpick-g title="Green 0–255" /></label>
          <label>B <input type="number" min="0" max="255" step="1" data-cpick-b title="Blue 0–255" /></label>
          <label class="cpick-hex">Hex <input type="text" maxlength="7" data-cpick-hex spellcheck="false" /></label>
        </div>
      </div>
      <div class="cpick-fields cpick-hsb">
        <label>H <input type="number" min="0" max="360" data-cpick-h title="Hue" /></label>
        <label>S <input type="number" min="0" max="100" data-cpick-s title="Saturation" /></label>
        <label>V <input type="number" min="0" max="100" data-cpick-v title="Brightness" /></label>
        <label>C <input type="number" min="0" max="100" data-cpick-c title="Contrast bias (preview only)" /></label>
      </div>
    </div>
  `;



  const sv = host.querySelector("[data-cpick-sv]");

  const hueBar = host.querySelector("[data-cpick-hue]");

  const cursor = host.querySelector("[data-cpick-sv-cursor]");

  const swatch = host.querySelector("[data-cpick-swatch]");

  const inH = host.querySelector("[data-cpick-h]");

  const inS = host.querySelector("[data-cpick-s]");

  const inV = host.querySelector("[data-cpick-v]");

  const inC = host.querySelector("[data-cpick-c]");

  const inR = host.querySelector("[data-cpick-r]");

  const inG = host.querySelector("[data-cpick-g]");

  const inB = host.querySelector("[data-cpick-b]");

  const inHex = host.querySelector("[data-cpick-hex]");



  let contrast = 50;

  let dragging = null;

  let suppress = false;



  function stateHSB() {

    return voxie.getColorHSB();

  }



  function applyHSB(h, s, b, fromUi = true) {

    suppress = true;

    voxie.setMaterialId?.(null);

    voxie.setColorHSB(h, s, b);

    if (fromUi) paintUi();

    suppress = false;

  }



  function drawHue() {

    const ctx = hueBar.getContext("2d");

    const w = hueBar.width;

    const h = hueBar.height;

    const g = ctx.createLinearGradient(0, 0, w, 0);

    for (let i = 0; i <= 6; i++) {

      const hh = (i / 6) * 360;

      g.addColorStop(i / 6, hsbToHex(hh, 100, 100));

    }

    ctx.fillStyle = g;

    ctx.fillRect(0, 0, w, h);

    const { h: hue } = stateHSB();

    const x = (hue / 360) * w;

    ctx.strokeStyle = "#fff";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(x, 0);

    ctx.lineTo(x, h);

    ctx.stroke();

  }



  function drawSV() {

    const { h } = stateHSB();

    const ctx = sv.getContext("2d");

    const w = sv.width;

    const ht = sv.height;

    const img = ctx.createImageData(w, ht);

    for (let y = 0; y < ht; y++) {

      const sat = (y / (ht - 1)) * 100;

      for (let x = 0; x < w; x++) {

        const bri = (x / (w - 1)) * 100;

        // Visual contrast bias only for the square (does not change placed color).

        const vAdj = clamp(bri + (contrast - 50) * 0.15, 0, 100);

        const { r, g, b } = hsbToRgb(h, sat, vAdj);

        const i = (y * w + x) * 4;

        img.data[i] = r;

        img.data[i + 1] = g;

        img.data[i + 2] = b;

        img.data[i + 3] = 255;

      }

    }

    ctx.putImageData(img, 0, 0);

  }



  function paintUi() {

    const { h, s, b } = stateHSB();

    const hex = normalizeHex(voxie.getColorHex());

    const rgb = hexToRgb(hex);

    if (swatch) swatch.style.background = hex;

    if (inH) inH.value = String(h);

    if (inS) inS.value = String(s);

    if (inV) inV.value = String(b);

    if (inC) inC.value = String(contrast);

    if (inR) inR.value = String(rgb.r);

    if (inG) inG.value = String(rgb.g);

    if (inB) inB.value = String(rgb.b);

    if (inHex) inHex.value = hex;

    if (cursor) {

      cursor.style.left = `${(b / 100) * 100}%`;

      cursor.style.top = `${(s / 100) * 100}%`;

    }

    // Keep legacy swatch hosts in sync if present outside this picker.

    const legacy = host.ownerDocument?.querySelector("[data-voxie-swatch]");

    if (legacy && legacy !== swatch) legacy.style.background = hex;

    const hexRead = host.ownerDocument?.querySelector("[data-voxie-hex]");

    if (hexRead) hexRead.textContent = hex;

    drawHue();

    drawSV();

  }



  function svFromEvent(e) {

    const rect = sv.getBoundingClientRect();

    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);

    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);

    const { h } = stateHSB();

    applyHSB(h, Math.round(y * 100), Math.round(x * 100));

  }



  function hueFromEvent(e) {

    const rect = hueBar.getBoundingClientRect();

    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);

    const { s, b } = stateHSB();

    applyHSB(Math.round(x * 360), s, b);

  }



  sv.addEventListener("pointerdown", (e) => {

    dragging = "sv";

    sv.setPointerCapture(e.pointerId);

    svFromEvent(e);

  });

  sv.addEventListener("pointermove", (e) => {

    if (dragging === "sv") svFromEvent(e);

  });

  sv.addEventListener("pointerup", () => {

    dragging = null;

  });



  hueBar.addEventListener("pointerdown", (e) => {

    dragging = "hue";

    hueBar.setPointerCapture(e.pointerId);

    hueFromEvent(e);

  });

  hueBar.addEventListener("pointermove", (e) => {

    if (dragging === "hue") hueFromEvent(e);

  });

  hueBar.addEventListener("pointerup", () => {

    dragging = null;

  });



  inH?.addEventListener("change", () => {

    const { s, b } = stateHSB();

    applyHSB(clamp(Number(inH.value) || 0, 0, 360), s, b);

  });

  inS?.addEventListener("change", () => {

    const { h, b } = stateHSB();

    applyHSB(h, clamp(Number(inS.value) || 0, 0, 100), b);

  });

  inV?.addEventListener("change", () => {

    const { h, s } = stateHSB();

    applyHSB(h, s, clamp(Number(inV.value) || 0, 0, 100));

  });

  inC?.addEventListener("change", () => {

    contrast = clamp(Number(inC.value) || 50, 0, 100);

    drawSV();

  });



  function fromRgb() {

    const r = clamp(Number(inR.value) || 0, 0, 255);

    const g = clamp(Number(inG.value) || 0, 0, 255);

    const b = clamp(Number(inB.value) || 0, 0, 255);

    const hsb = rgbToHsb(r, g, b);

    applyHSB(hsb.h, hsb.s, hsb.b);

  }

  // Integer RGB — apply on input (live) and change (commit).
  inR?.addEventListener("input", fromRgb);
  inG?.addEventListener("input", fromRgb);
  inB?.addEventListener("input", fromRgb);
  inR?.addEventListener("change", fromRgb);
  inG?.addEventListener("change", fromRgb);
  inB?.addEventListener("change", fromRgb);

  inHex?.addEventListener("change", () => {
    const hsb = hexToHsb(normalizeHex(inHex.value));
    applyHSB(hsb.h, hsb.s, hsb.b);
  });
  inHex?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const hsb = hexToHsb(normalizeHex(inHex.value));
      applyHSB(hsb.h, hsb.s, hsb.b);
    }
  });



  const off = voxie.on?.("colorChange", () => {

    if (!suppress) paintUi();

  });



  paintUi();



  return {

    sync: paintUi,

    dispose() {

      if (typeof off === "function") off();

      host.innerHTML = "";

    },

  };

}


