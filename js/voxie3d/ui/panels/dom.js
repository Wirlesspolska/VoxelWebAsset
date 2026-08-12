/** Tiny DOM helpers for forge left-dock panels. */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, "");
    else if (v != null && v !== false) node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function section(title, attrs = {}, children = []) {
  return el(
    "section",
    { className: "forge-panel", "data-panel": attrs.panel || "", ...attrs },
    [el("h2", { text: title }), ...children]
  );
}

export function field(label, inputAttrs = {}) {
  const inp = el("input", inputAttrs);
  return el("label", { className: "field" }, [label + " ", inp]);
}

export function check(label, inputAttrs = {}) {
  const inp = el("input", { type: "checkbox", ...inputAttrs });
  return el("label", { className: "check" }, [inp, " " + label]);
}
