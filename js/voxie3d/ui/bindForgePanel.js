/**

 * Side-panel binder: palette / last / favourites, brushes, shapes, stroke,

 * selection attrs, texturizer, asset browser, effects.

 * Additive to bindForgeHud — call after HUD mount.

 */



import { BRUSH_PRESETS } from "../tools/brushes.js";
import { generateTexturePixels } from "../tools/texturizer.js";

import { hexToRgb, rgbToHex, hexToHsb, hsbToHex, normalizeHex, clamp } from "../color/hsb.js";

import { isTextureShard, mergeTextureShards } from "../io/texturePack.js";



/**

 * @param {ReturnType<import('../createVoxie3D.js').createVoxie3D>} voxie

 * @param {ParentNode} [root]

 */

export function bindForgePanel(voxie, root = document) {

  const $ = (sel) => root.querySelector(sel);



  const brushPresets = $("[data-voxie-brush-presets]");

  const brushW = $("[data-voxie-brush-w]");

  const brushH = $("[data-voxie-brush-h]");

  const circleR = $("[data-voxie-circle-r]");

  const lastHost = $("[data-voxie-last-colors]");

  const favHost = $("[data-voxie-fav-colors]");

  const favToggle = $("[data-voxie-fav-toggle]");

  const hexReadout = $("[data-voxie-hex]");

  const selAttrs = $("[data-voxie-selection-attrs]");

  const browserList = $("[data-voxie-browser-list]");

  const activeList = $("[data-voxie-active-palette]");

  const texWeights = $("[data-voxie-tex-weights]");

  const texPreview = $("[data-voxie-tex-preview]");

  const texPalette = $("[data-voxie-tex-palette]");

  const texImportFile = $("[data-voxie-tex-import-file]");

  const texPreviewLabel = $("[data-voxie-tex-preview-label]");



  /** @type {{ hex:string, weight:number }[]} */

  let weightRows = [

    { hex: voxie.getColorHex(), weight: 2 },

    { hex: "#2a2218", weight: 1 },

  ];

  /** Preview dice seed (Generate persists a new texture; Dice only refreshes preview). */
  let previewSeed = 1;



  function paintStrip(host, colors, { favouriteStyle = false } = {}) {

    if (!host) return;

    host.innerHTML = "";

    for (const hex of colors) {

      const btn = document.createElement("button");

      btn.type = "button";

      btn.className = "mini-swatch" + (favouriteStyle ? " is-fav" : "");

      btn.style.background = hex;

      btn.title = hex;

      btn.addEventListener("click", () => {

        voxie.setMaterialId?.(null);

        voxie.setColorHex(hex);

        syncColorBits();

      });

      host.appendChild(btn);

    }

    if (!colors.length) {

      const empty = document.createElement("span");

      empty.className = "forge-tag";

      empty.textContent = favouriteStyle ? "Star a color" : "Paint to fill";

      host.appendChild(empty);

    }

  }



  function syncColorBits() {

    const hex = voxie.getColorHex();

    if (hexReadout) hexReadout.textContent = hex;

    paintStrip(lastHost, voxie.swatches?.getLast?.() || []);

    paintStrip(favHost, voxie.swatches?.getFavourites?.() || [], { favouriteStyle: true });

    if (favToggle) {

      favToggle.classList.toggle("is-active", !!voxie.swatches?.isFavourite?.(hex));

    }

  }



  function syncBrushUI() {

    const st = voxie.getBrushState?.() || voxie.getState();

    if (brushW) brushW.value = String(st.brushW ?? 1);

    if (brushH) brushH.value = String(st.brushH ?? 1);

    if (circleR) circleR.value = String(st.circleRadius ?? 4);

    root.querySelectorAll("[data-voxie-brush-mode]").forEach((btn) => {

      btn.classList.toggle("is-active", btn.dataset.voxieBrushMode === (st.brushShape || "rect"));

    });

    root.querySelectorAll("[data-voxie-brush-preset]").forEach((btn) => {

      const w = Number(btn.dataset.w);

      const h = Number(btn.dataset.h);

      btn.classList.toggle(

        "is-active",

        st.brushShape !== "circle" && st.brushW === w && st.brushH === h

      );

    });

  }



  function syncSelectionUI() {

    if (!selAttrs) return;

    const a = voxie.getSelectionAttributes?.();

    if (!a || !a.count) {

      selAttrs.innerHTML = `<p class="forge-tag">Shift+click / Shift+drag box</p>`;

      return;

    }

    const pos = a.position

      ? `(${a.position.x}, ${a.position.y}, ${a.position.z})`

      : `${a.count} voxels`;

    selAttrs.innerHTML = `

      <div class="meta">

        <span>Count</span><strong>${a.count}</strong>

        <span>Pos</span><strong>${pos}</strong>

        <span>Color</span><strong>${a.mixedColor ? "mixed" : a.color || "—"}</strong>

        <span>Group</span><strong>${a.groupId || "—"}</strong>

        <span>Tex</span><strong>${a.textureId || "—"}</strong>

      </div>`;

  }



  function syncBrowserUI() {

    const browser = voxie.assetBrowser;

    if (!browser) return;

    if (browserList) {

      browserList.innerHTML = "";

      for (const m of browser.list()) {

        const li = document.createElement("li");

        li.innerHTML = `<span>${m.name}</span><span class="group-meta">${m.kind}</span>`;

        li.title = m.pathOrKey || m.id;

        li.addEventListener("click", async () => {

          await browser.activate(m.id);

          syncBrowserUI();

        });

        browserList.appendChild(li);

      }

    }

    if (activeList) {

      activeList.innerHTML = "";

      for (const m of browser.listActive()) {

        const li = document.createElement("li");

        li.classList.add("is-selected");

        li.innerHTML = `<span>${m.name}</span><button type="button" class="btn" data-evict>Evict</button>`;

        li.querySelector("[data-evict]")?.addEventListener("click", (e) => {

          e.stopPropagation();

          browser.evict(m.id);

          syncBrowserUI();

        });

        li.addEventListener("click", () => {

          if (m.kind === "texture" || m.payload?.weights) {

            voxie.setActiveTexture?.(m.id);

          }

        });

        activeList.appendChild(li);

      }

    }

  }



  function cloneWeightAt(i, { hueNudge = 0 } = {}) {
    const src = weightRows[i];
    if (!src) return;
    let hex = normalizeHex(src.hex);
    if (hueNudge) {
      const hsb = hexToHsb(hex);
      hex = hsbToHex((hsb.h + hueNudge + 360) % 360, hsb.s, hsb.b);
    }
    const w = Math.max(1, Math.round((Number(src.weight) || 1) / 2));
    weightRows.splice(i + 1, 0, { hex, weight: w });
    renderWeightEditor();
    drawTexPreview();
  }

  function renderWeightEditor() {
    if (!texWeights) return;
    texWeights.innerHTML = "";
    weightRows.forEach((row, i) => {
      const hex = normalizeHex(row.hex);
      const rgb = hexToRgb(hex);
      const wrap = document.createElement("div");
      wrap.className = "tex-weight-row";
      wrap.innerHTML = `
        <div class="tex-weight-rgb">
          <div class="tex-weight-swatch" data-swatch style="background:${hex}" title="${hex}"></div>
          <label>R <input type="number" min="0" max="255" step="1" value="${rgb.r}" data-i="${i}" data-k="r" /></label>
          <label>G <input type="number" min="0" max="255" step="1" value="${rgb.g}" data-i="${i}" data-k="g" /></label>
          <label>B <input type="number" min="0" max="255" step="1" value="${rgb.b}" data-i="${i}" data-k="b" /></label>
          <label>W <input type="number" min="1" max="100" value="${row.weight}" data-i="${i}" data-k="weight" /></label>
        </div>
        <div class="tex-weight-hex">
          <label class="field" style="margin:0">Hex
            <input type="text" maxlength="7" value="${hex}" data-i="${i}" data-k="hex" spellcheck="false" />
          </label>
          <div class="row" style="margin:0">
            <button type="button" class="btn" data-clone="${i}" title="Duplicate same color (half weight) — then nudge hue">Clone</button>
            <button type="button" class="btn" data-hue="${i}" title="Clone + hue +8°">Hue+</button>
            <button type="button" class="btn" data-rm="${i}">×</button>
          </div>
        </div>`;
      texWeights.appendChild(wrap);
    });

    const applyRow = (i) => {
      const row = weightRows[i];
      if (!row) return;
      const r = clamp(Number(texWeights.querySelector(`input[data-i="${i}"][data-k="r"]`)?.value) || 0, 0, 255);
      const g = clamp(Number(texWeights.querySelector(`input[data-i="${i}"][data-k="g"]`)?.value) || 0, 0, 255);
      const b = clamp(Number(texWeights.querySelector(`input[data-i="${i}"][data-k="b"]`)?.value) || 0, 0, 255);
      row.hex = rgbToHex(r, g, b);
      const hexInp = texWeights.querySelector(`input[data-i="${i}"][data-k="hex"]`);
      if (hexInp) hexInp.value = row.hex;
      const sw = texWeights.querySelectorAll("[data-swatch]")[i];
      if (sw) {
        sw.style.background = row.hex;
        sw.title = row.hex;
      }
      drawTexPreview();
    };

    texWeights.querySelectorAll("input").forEach((inp) => {
      const onEdit = () => {
        const i = Number(inp.dataset.i);
        const row = weightRows[i];
        if (!row) return;
        if (inp.dataset.k === "weight") {
          row.weight = Math.max(1, Number(inp.value) || 1);
          drawTexPreview();
          return;
        }
        if (inp.dataset.k === "hex") {
          row.hex = normalizeHex(inp.value);
          const rgb = hexToRgb(row.hex);
          const rEl = texWeights.querySelector(`input[data-i="${i}"][data-k="r"]`);
          const gEl = texWeights.querySelector(`input[data-i="${i}"][data-k="g"]`);
          const bEl = texWeights.querySelector(`input[data-i="${i}"][data-k="b"]`);
          if (rEl) rEl.value = String(rgb.r);
          if (gEl) gEl.value = String(rgb.g);
          if (bEl) bEl.value = String(rgb.b);
          const sw = texWeights.querySelectorAll("[data-swatch]")[i];
          if (sw) {
            sw.style.background = row.hex;
            sw.title = row.hex;
          }
          drawTexPreview();
          return;
        }
        applyRow(i);
      };
      inp.addEventListener("input", onEdit);
      inp.addEventListener("change", onEdit);
    });

    texWeights.querySelectorAll("[data-clone]").forEach((btn) => {
      btn.addEventListener("click", () => cloneWeightAt(Number(btn.dataset.clone)));
    });
    texWeights.querySelectorAll("[data-hue]").forEach((btn) => {
      btn.addEventListener("click", () => cloneWeightAt(Number(btn.dataset.hue), { hueNudge: 8 }));
    });
    texWeights.querySelectorAll("[data-rm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        weightRows.splice(Number(btn.dataset.rm), 1);
        if (!weightRows.length) weightRows = [{ hex: voxie.getColorHex(), weight: 1 }];
        renderWeightEditor();
        drawTexPreview();
      });
    });
  }

  function drawTexPreview() {
    if (!texPreview) return;
    const size = Number($("[data-voxie-tex-size]")?.value) === 16 ? 16 : 8;
    const pixels = generateTexturePixels(weightRows, size, previewSeed);
    const ctx = texPreview.getContext("2d");
    const scale = texPreview.width / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const { r, g, b } = hexToRgb(pixels[y * size + x]);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    if (texPreviewLabel) texPreviewLabel.textContent = `Preview · seed ${previewSeed >>> 0}`;
  }

  function paintTexThumb(def) {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const size = def.size >= 16 ? 16 : 8;
    const pixels = def.pixels || generateTexturePixels(def.weights, size, def.seed);
    const ctx = c.getContext("2d");
    const scale = 32 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const { r, g, b } = hexToRgb(pixels[y * size + x] || "#888");
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c.toDataURL();
  }

  function syncTexPalette() {
    if (!texPalette) return;
    const list = voxie.textures?.list?.() || [];
    const active = voxie.getState?.()?.activeTextureId;
    texPalette.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("span");
      empty.className = "forge-tag";
      empty.textContent = "Generate to fill palette";
      texPalette.appendChild(empty);
      return;
    }
    for (const def of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tex-thumb" + (def.id === active ? " is-active" : "");
      btn.title = def.id;
      btn.style.backgroundImage = `url(${paintTexThumb(def)})`;
      btn.style.backgroundSize = "cover";
      btn.addEventListener("click", () => {
        voxie.setActiveTexture?.(def.id);
        if (Array.isArray(def.weights) && def.weights.length) {
          weightRows = def.weights.map((w) => ({
            hex: normalizeHex(w.hex),
            weight: Math.max(1, Number(w.weight) || 1),
          }));
          previewSeed = def.seed >>> 0;
          renderWeightEditor();
          drawTexPreview();
        }
        syncTexPalette();
      });
      texPalette.appendChild(btn);
    }
  }



  // Brush presets

  if (brushPresets) {

    brushPresets.innerHTML = "";

    for (const p of BRUSH_PRESETS) {

      const btn = document.createElement("button");

      btn.type = "button";

      btn.className = "btn";

      btn.textContent = p.label;

      btn.dataset.voxieBrushPreset = p.id;

      btn.dataset.w = String(p.w);

      btn.dataset.h = String(p.h);

      btn.addEventListener("click", () => {

        voxie.setBrushRect?.(p.w, p.h);

        syncBrushUI();

      });

      brushPresets.appendChild(btn);

    }

  }



  const onBrushWH = () => {
    const w = Math.max(1, Math.min(32, Number(brushW?.value) || 1)) | 0;
    const h = Math.max(1, Math.min(32, Number(brushH?.value) || 1)) | 0;
    if (brushW) brushW.value = String(w);
    if (brushH) brushH.value = String(h);
    voxie.setBrushRect?.(w, h);
    syncBrushUI();
  };
  // Integer W×H — update on every keystroke, not only blur
  brushW?.addEventListener("input", onBrushWH);
  brushH?.addEventListener("input", onBrushWH);
  brushW?.addEventListener("change", onBrushWH);
  brushH?.addEventListener("change", onBrushWH);

  circleR?.addEventListener("change", () => {

    voxie.setCircleRadius?.(Number(circleR.value));

    syncBrushUI();

  });

  root.querySelectorAll("[data-voxie-brush-mode]").forEach((btn) => {

    btn.addEventListener("click", () => {

      voxie.setBrushShape?.(btn.dataset.voxieBrushMode);

      if (btn.dataset.voxieBrushMode === "circle") {

        voxie.setCircleRadius?.(Number(circleR?.value || 4));

      }

      syncBrushUI();

    });

  });



  root.querySelectorAll("[data-voxie-shape]").forEach((btn) => {

    btn.addEventListener("click", () => {

      voxie.setShapeId?.(btn.dataset.voxieShape);

      voxie.setTool?.("shape");

      root.querySelectorAll("[data-voxie-shape]").forEach((b) => {

        b.classList.toggle("is-active", b === btn);

      });

    });

  });



  const strokeLen = $("[data-voxie-stroke-len]");

  const strokeSmooth = $("[data-voxie-stroke-smooth]");

  const strokeGroup = $("[data-voxie-stroke-group]");

  const syncStroke = () => {

    voxie.setStrokeOptions?.({

      length: Number(strokeLen?.value || 5),

      smooth: !!strokeSmooth?.checked,

      asGroup: !!strokeGroup?.checked,

    });

  };

  strokeLen?.addEventListener("change", syncStroke);

  strokeSmooth?.addEventListener("change", syncStroke);

  strokeGroup?.addEventListener("change", syncStroke);



  $("[data-voxie-sel-recolor]")?.addEventListener("click", () => {
    const n = voxie.recolorSelection?.(voxie.getColorHex());
    if (!n) alert("Select voxels first (Shift+click / box).");
    syncSelectionUI();
  });

  $("[data-voxie-sel-shade]")?.addEventListener("click", () => {
    const n = voxie.shadeSelection?.("y", 0.35);
    if (!n) alert("Select voxels first (Shift+click / box).");
    syncSelectionUI();
  });

  $("[data-voxie-sel-delete]")?.addEventListener("click", () => {
    voxie.deleteSelection?.();
    syncSelectionUI();
  });

  $("[data-voxie-effect-apply]")?.addEventListener("click", () => {

    const id = $("[data-voxie-effect]")?.value || "shadow";

    const n = voxie.applyEffectToSelection?.(id);

    if (!n) alert("Select voxels first (Shift+click).");

    syncSelectionUI();

  });



  favToggle?.addEventListener("click", () => {

    voxie.swatches?.toggleFavourite?.(voxie.getColorHex());

    syncColorBits();

  });



  // Textures — generator / palette / RGB weights
  renderWeightEditor();
  drawTexPreview();
  syncTexPalette();

  const addCurrentWeight = () => {
    weightRows.push({ hex: voxie.getColorHex(), weight: 1 });
    renderWeightEditor();
    drawTexPreview();
  };

  $("[data-voxie-tex-add-current]")?.addEventListener("click", addCurrentWeight);
  $("[data-voxie-tex-add-weight]")?.addEventListener("click", addCurrentWeight);

  $("[data-voxie-tex-size]")?.addEventListener("change", drawTexPreview);

  $("[data-voxie-tex-reroll]")?.addEventListener("click", () => {
    previewSeed = (Math.random() * 0xffffffff) >>> 0;
    drawTexPreview();
  });

  $("[data-voxie-tex-generate]")?.addEventListener("click", () => {
    const size = Number($("[data-voxie-tex-size]")?.value) === 16 ? 16 : 8;
    previewSeed = (Math.random() * 0xffffffff) >>> 0;
    const def = voxie.createTexturizer?.({ weights: weightRows, size, seed: previewSeed });
    if (def) {
      drawTexPreview();
      syncBrowserUI();
      syncTexPalette();
    }
  });

  $("[data-voxie-tex-apply]")?.addEventListener("click", () => {
    const size = Number($("[data-voxie-tex-size]")?.value) === 16 ? 16 : 8;
    voxie.createTexturizer?.({ weights: weightRows, size, seed: previewSeed });
    const n = voxie.applyTexturizerToSelection?.();
    if (!n) alert("Select voxels first (Shift+click), or use Texturizer tool.");
    syncTexPalette();
  });

  $("[data-voxie-tex-apply-group]")?.addEventListener("click", () => {
    const size = Number($("[data-voxie-tex-size]")?.value) === 16 ? 16 : 8;
    voxie.createTexturizer?.({ weights: weightRows, size, seed: previewSeed });
    const id = voxie.getState?.()?.groupSelected;
    const n = voxie.applyTexturizerToGroup?.(id);
    if (!n) alert("Select a group first (Groups list).");
    syncTexPalette();
  });

  $("[data-voxie-tex-use-brush]")?.addEventListener("click", () => {
    const size = Number($("[data-voxie-tex-size]")?.value) === 16 ? 16 : 8;
    const def = voxie.createTexturizer?.({ weights: weightRows, size, seed: previewSeed });
    if (def) {
      voxie.setActiveTexture?.(def.id);
      voxie.setTool?.("texturizer");
      syncTexPalette();
    }
  });

  $("[data-voxie-tex-export]")?.addEventListener("click", () => {

    voxie.exportTexturePack?.();

  });

  $("[data-voxie-tex-import]")?.addEventListener("click", () => texImportFile?.click());

  texImportFile?.addEventListener("change", async () => {

    const file = texImportFile.files?.[0];

    texImportFile.value = "";

    if (!file) return;

    try {

      const doc = JSON.parse(await file.text());

      if (isTextureShard(doc) || doc.textures) {

        voxie.importTextureShard?.(doc);

      } else {

        const map = mergeTextureShards([doc]);

        voxie.importTextureShard?.({ textures: map });

      }

      syncBrowserUI();

    } catch (err) {

      console.warn(err);

      alert("Could not import texture JSON.");

    }

  });



  $("[data-voxie-browser-refresh]")?.addEventListener("click", () => {

    voxie.assetBrowser?.refreshIndex?.();

    syncBrowserUI();

  });



  voxie.on?.("colorChange", syncColorBits);

  voxie.on?.("swatchesChange", syncColorBits);

  voxie.on?.("selectionChange", syncSelectionUI);

  voxie.on?.("brushChange", syncBrushUI);

  voxie.on?.("texturesChange", () => {
    syncBrowserUI();
    syncTexPalette();
  });
  voxie.on?.("activeTextureChange", syncTexPalette);

  syncColorBits();
  syncBrushUI();
  syncSelectionUI();
  syncBrowserUI();
  syncTexPalette();

  return { syncColorBits, syncBrushUI, syncSelectionUI, syncBrowserUI, syncTexPalette };
}


