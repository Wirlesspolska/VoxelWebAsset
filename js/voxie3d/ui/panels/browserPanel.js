import { el, section } from "./dom.js";

export function createBrowserPanel() {
  const root = section("Browser", { panel: "browser" }, [
    el("p", { className: "forge-tag", text: "Metadata only — activate loads into RAM" }),
    el("ul", { className: "asset-list", "data-voxie-browser-list": "" }),
    el("h3", { className: "subhead", text: "Active palette" }),
    el("ul", { className: "asset-list is-active", "data-voxie-active-palette": "" }),
    el("button", { type: "button", className: "btn", "data-voxie-browser-refresh": "", text: "Refresh index" }),
  ]);
  return { root, bind() {}, id: "browser" };
}
