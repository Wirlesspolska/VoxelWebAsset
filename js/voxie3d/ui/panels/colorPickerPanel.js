import { el, section, check } from "./dom.js";

import { bindColorPicker } from "../colorPicker.js";



/**

 * Color module: picker host + favourites/last strips + noise opt-in.

 */

export function createColorPickerPanel() {

  const pickerHost = el("div", { "data-voxie-color-picker": "" });

  const lastHost = el("div", { className: "swatch-strip", "data-voxie-last-colors": "" });

  const favHost = el("div", { className: "swatch-strip", "data-voxie-fav-colors": "" });

  const paletteHost = el("div", { className: "palette-grid", "data-voxie-palette": "" });

  const presetRow = el("div", { className: "row", id: "preset-row" });



  const root = section("Color", { panel: "color" }, [

    el("p", {
      className: "forge-tag",
      text: "RGB + Hex under the picker · type integers 0–255",
    }),

    pickerHost,

    el("div", { className: "swatch-row" }, [

      el("div", { className: "swatch", "data-voxie-swatch": "", hidden: true, title: "legacy sync" }),

      el("button", { type: "button", className: "btn", "data-voxie-fav-toggle": "", text: "★", title: "Pin favourite" }),

      el("code", { className: "hex-readout", "data-voxie-hex": "", text: "#c4e070" }),

    ]),

    check("Noise tint when placing", { "data-voxie-noise-tint": "" }),

    el("h3", { className: "subhead", text: "Palette" }),

    paletteHost,

    el("h3", { className: "subhead", text: "Last colors" }),

    lastHost,

    el("h3", { className: "subhead", text: "Favourites" }),

    favHost,

    presetRow,

  ]);



  let picker = null;



  function bind(voxie) {

    picker = bindColorPicker(voxie, pickerHost);

  }



  function sync() {

    picker?.sync?.();

  }



  return { root, bind, sync, id: "color" };

}


