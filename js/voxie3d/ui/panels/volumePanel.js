import { el, section } from "./dom.js";
import { BIOME_IDS, getBiome } from "../../world/biomes.js";
import { CHUNK_DIRS, DIR_OFFSETS } from "../../world/chunks.js";

export function createVolumePanel() {
  const biomeSelect = el(
    "select",
    { "data-voxie-chunk-biome": "" },
    BIOME_IDS.map((id) => el("option", { value: id, text: getBiome(id).label }))
  );

  const heightInput = el("input", {
    type: "number",
    min: "16",
    max: "256",
    step: "2",
    value: "48",
    "data-voxie-chunk-height": "",
    title: "Chunk / world Y extent — larger = taller mountains & icebergs",
  });

  const chunkSizeSelect = el(
    "select",
    {
      "data-voxie-chunk-size": "",
      title: "XZ footprint for new chunks (larger worlds)",
    },
    [
      el("option", { value: "32", text: "32×32" }),
      el("option", { value: "48", text: "48×48" }),
      el("option", { value: "64", text: "64×64", selected: true }),
      el("option", { value: "96", text: "96×96" }),
    ]
  );

  const dirRow = el(
    "div",
    { className: "row wrap", "data-voxie-chunk-dirs": "" },
    CHUNK_DIRS.map((d) =>
      el("label", { className: "check" }, [
        el("input", {
          type: "checkbox",
          value: d,
          "data-voxie-chunk-dir": d,
          ...(d === "E" ? { checked: true } : {}),
        }),
        ` ${DIR_OFFSETS[d].label}`,
      ])
    )
  );

  const progressEl = el("p", {
    className: "forge-tag",
    "data-voxie-chunk-progress": "",
    text: "No pending chunks",
  });

  const worldBlock = el("div", { className: "utility-group", "data-voxie-world-meta": "", hidden: true }, [
    el("h3", { className: "subhead", text: "World" }),
    el("div", { className: "meta" }, [
      el("span", { text: "Mode" }),
      el("strong", { "data-voxie-mode": "", text: "—" }),
      el("span", { text: "Size" }),
      el("strong", { "data-voxie-world-size": "", text: "—" }),
    ]),
    el("label", { className: "field" }, [
      "Seed ",
      el("input", { type: "text", "data-voxie-seed": "", value: "" }),
    ]),
    el("p", { className: "forge-tag" }, [
      "Seed ",
      el("span", { "data-voxie-seed-val": "", text: "—" }),
    ]),
    el("div", { className: "row" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-regen": "",
        text: "Regen terrain",
      }),
    ]),
    el("h3", { className: "subhead", text: "Add chunk" }),
    el("p", {
      className: "forge-tag",
      text: "Grow the map after load — N/E/S/W adjoining tiles. Preview pulses until filled.",
    }),
    el("label", { className: "field" }, ["Biome ", biomeSelect]),
    el("label", { className: "field" }, ["Chunk size ", chunkSizeSelect]),
    el("label", { className: "field" }, ["Height ", heightInput]),
    el("p", { className: "forge-tag", text: "Directions" }),
    dirRow,
    el("div", { className: "row wrap" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-chunk-preview": "",
        text: "Preview",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-chunk-add": "",
        text: "+ Add chunk",
      }),
      el("button", {
        type: "button",
        className: "btn btn-danger",
        "data-voxie-chunk-cancel": "",
        text: "Cancel",
      }),
    ]),
    progressEl,
    el("h3", { className: "subhead", text: "Lights" }),
    el("p", {
      className: "forge-tag",
      text: "Ambient only until you place a light. Shadows need a light + Performance → Shadows.",
    }),
    el("div", { className: "row wrap" }, [
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-light-sun": "",
        text: "Place sun",
        title: "Directional light near the orbit pivot",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-light-point": "",
        text: "Place point",
        title: "Point light near the orbit pivot",
      }),
      el("button", {
        type: "button",
        className: "btn btn-danger",
        "data-voxie-light-clear": "",
        text: "Clear lights",
      }),
    ]),
  ]);

  const root = section("Volume", { panel: "volume" }, [
    el("p", {
      className: "forge-tag",
      text: "Export · Import · Clear. Binary (.vxb) when >5k voxels.",
    }),
    worldBlock,
    el("label", { className: "field" }, [
      "Scale ",
      el("select", { "data-voxie-export-scale": "" }, [
        el("option", { value: "1", text: "1×" }),
        el("option", { value: "2", text: "2×" }),
        el("option", { value: "4", text: "4× game", selected: true }),
      ]),
    ]),
    el("div", { className: "row" }, [
      el("button", { type: "button", className: "btn", "data-voxie-export": "", text: "Export" }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-export-json": "",
        text: "JSON",
      }),
      el("button", {
        type: "button",
        className: "btn",
        "data-voxie-export-vxb": "",
        text: "Binary",
      }),
      el("button", { type: "button", className: "btn", "data-voxie-import": "", text: "Import…" }),
      el("button", { type: "button", className: "btn btn-danger", "data-voxie-clear": "", text: "Clear" }),
    ]),
    el("input", {
      type: "file",
      accept: "application/json,.json,.vxw,.vxt,.vxb,application/octet-stream",
      "data-voxie-import-file": "",
      hidden: true,
    }),
  ]);

  function selectedDirs() {
    return [...root.querySelectorAll("[data-voxie-chunk-dir]:checked")].map((n) => n.value);
  }

  function bind(voxie) {
    const world = voxie.getState?.()?.mode === "world";
    worldBlock.hidden = !world;
    if (!world) return;

    const map = voxie.getChunkMap?.();
    if (map?.height && heightInput) heightInput.value = String(map.height);

    const setProgress = (text) => {
      if (progressEl) progressEl.textContent = text;
    };

    const previewBtn = root.querySelector("[data-voxie-chunk-preview]");
    const addBtn = root.querySelector("[data-voxie-chunk-add]");
    const cancelBtn = root.querySelector("[data-voxie-chunk-cancel]");

    const onPreview = () => {
      const dirs = selectedDirs();
      if (!dirs.length) {
        setProgress("Pick at least one direction");
        return;
      }
      const pending = voxie.previewWorldChunks?.(dirs, { biome: biomeSelect.value });
      setProgress(
        pending?.length
          ? `Preview ${pending.length} chunk(s) · ${map?.chunkSize || 32}×${map?.chunkSize || 32}×${heightInput.value}`
          : "Neighbors already filled"
      );
    };

    const onAdd = () => {
      const dirs = selectedDirs();
      if (!dirs.length) {
        setProgress("Pick at least one direction");
        return;
      }
      const height = Math.max(16, Number(heightInput.value) || 48);
      const chunkSize = Math.max(16, Number(chunkSizeSelect.value) || 64);
      const result = voxie.addWorldChunks?.({
        dirs,
        biome: biomeSelect.value,
        height,
        chunkSize,
      });
      if (!result?.added?.length) {
        setProgress("No new chunks (already exist)");
        return;
      }
      setProgress(`Generating ${result.added.length} chunk(s)…`);
      result.promise?.then((done) => {
        if (done?.cancelled) setProgress("Cancelled");
        else setProgress(`Added ${done?.added?.length || 0} chunk(s)`);
      });
    };

    previewBtn?.addEventListener("click", onPreview);
    addBtn?.addEventListener("click", onAdd);
    cancelBtn?.addEventListener("click", () => {
      voxie.cancelWorldChunks?.();
      setProgress("Cancelled");
    });

    root.querySelector("[data-voxie-light-sun]")?.addEventListener("click", () => {
      voxie.placeLight?.({ kind: "sun" });
      setProgress("Sun light placed");
    });
    root.querySelector("[data-voxie-light-point]")?.addEventListener("click", () => {
      voxie.placeLight?.({ kind: "point" });
      setProgress("Point light placed");
    });
    root.querySelector("[data-voxie-light-clear]")?.addEventListener("click", () => {
      voxie.clearLights?.();
      setProgress("Lights cleared (ambient only)");
    });

    // Live preview when dirs / biome change
    dirRow.addEventListener("change", onPreview);
    biomeSelect.addEventListener("change", onPreview);

    const offProgress = voxie.on?.("chunkGenProgress", (p) => {
      if (!p) return;
      const pct = p.totalCols ? Math.floor((100 * (p.doneCols || 0)) / p.totalCols) : 100;
      setProgress(`Filling… ${pct}% (${p.remainingChunks ?? "?"} left)`);
    });
    const offDone = voxie.on?.("chunkGenDone", (p) => {
      setProgress(`Added ${p?.added?.length || 0} chunk(s)`);
    });

    // stash cleanup hooks if panel re-binds later
    worldBlock._chunkUnbind = () => {
      offProgress?.();
      offDone?.();
    };
  }

  function sync(voxie) {
    const world = voxie.getState?.()?.mode === "world";
    worldBlock.hidden = !world;
    const map = voxie.getChunkMap?.();
    if (map?.height && document.activeElement !== heightInput) {
      heightInput.value = String(Math.max(map.height, voxie.getWorldSize?.()?.y || 32));
    }
  }

  return { root, bind, sync, id: "volume" };
}
