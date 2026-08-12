import { el, section } from "./dom.js";
import { getControlBindings } from "../../input/bindingsHelp.js";

/** Compact bindings — mirrored in bottom controls bar via bindingsHelp. */
export function createBindingsPanel() {
  // Default list mirrors Place tool (Minecraft-style paint/erase); HUD chips stay tool-aware.
  const items = getControlBindings({ tool: "place" }).map((b) =>
    el("li", { html: `<b>${b.keys}</b> ${b.action}` })
  );
  items.push(
    el("li", {
      html: "<b>Generate shape</b> Scroll = reroll only until <b>LMB</b> place or <b>Esc</b> (slice/zoom off)",
    })
  );
  items.push(el("li", { html: "<b>Esc</b> clear selection / deselect · <b>F12</b> nerd" }));
  items.push(
    el("li", {
      html: "<b>Texturizer</b> tool navbar · RGB weights · Clone · live preview",
    })
  );

  const root = section("Controls", { panel: "bindings" }, [
    el("p", {
      className: "forge-tag",
      text: "Same bindings as the bottom Controls strip — open here for the full list.",
    }),
    el("ul", { className: "bindings", "data-voxie-bindings-list": "" }, items),
  ]);
  return { root, bind() {}, id: "bindings" };
}
