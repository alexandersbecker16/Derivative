import { compile1D, compile2D, PRESETS_2D, PRESETS_3D } from "./math-engine.js?v=12";
import { prettyMathHtml } from "./pretty-math.js?v=12";
import { View2D } from "./view2d.js?v=12";
import { View3D } from "./view3d.js?v=12";

const els = {
  input: document.getElementById("equation-input"),
  pretty: document.getElementById("eq-pretty"),
  eqField: document.querySelector(".eq-field"),
  prefix: document.getElementById("eq-prefix"),
  error: document.getElementById("eq-error"),
  presets: document.getElementById("eq-presets"),
  canvas2d: document.getElementById("view-2d"),
  canvas3d: document.getElementById("view-3d"),
  controls2d: document.getElementById("controls-2d"),
  controls3d: document.getElementById("controls-3d"),
  hint2d: document.getElementById("hint-2d"),
  hint3d: document.getElementById("hint-3d"),
  hudSecant: document.getElementById("hud-secant"),
  hudSecantLabel: document.getElementById("hud-secant-label"),
  hudDeriv: document.getElementById("hud-deriv"),
  hudDerivLabel: document.getElementById("hud-deriv-label"),
  hudDelta: document.getElementById("hud-delta"),
  overlapFill: document.getElementById("overlap-fill"),
  overlapCaption: document.getElementById("overlap-caption"),
  modeBtns: [...document.querySelectorAll(".mode-btn")],
};

let mode = "2d";

function updateHud(info) {
  els.hudSecant.textContent = info.secant;
  if (els.hudSecantLabel) {
    els.hudSecantLabel.textContent = mode === "3d" ? "Plane ∇" : "Secant slope";
  }
  els.hudDeriv.textContent = info.deriv;
  els.hudDerivLabel.textContent = info.derivLabel;
  els.hudDelta.textContent = info.delta;
  els.overlapFill.style.width = `${Math.round(info.overlap * 100)}%`;
  els.overlapCaption.textContent = info.caption;
}

const view2d = new View2D(els.canvas2d, updateHud);
const view3d = new View3D(els.canvas3d, updateHud);

function updatePretty() {
  if (!els.pretty) return;
  const html = prettyMathHtml(els.input.value) || "&nbsp;";
  els.pretty.innerHTML = `<span class="eq-pretty-inner">${html}</span>`;
}

function renderPresets() {
  const list = mode === "2d" ? PRESETS_2D : PRESETS_3D;
  els.presets.innerHTML = "";
  for (const p of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset";
    btn.innerHTML = prettyMathHtml(p.expr) || p.label;
    btn.title = p.expr;
    btn.addEventListener("click", () => {
      els.input.value = p.expr;
      applyEquation();
    });
    els.presets.appendChild(btn);
  }
}

function applyEquation() {
  const expr = els.input.value;
  updatePretty();
  try {
    if (mode === "2d") {
      const f = compile1D(expr);
      f(0);
      f(1);
      view2d.setFunction(f);
    } else {
      const f = compile2D(expr);
      f(0, 0);
      f(1, 1);
      view3d.setFunction(f);
    }
    els.input.classList.remove("is-invalid");
    els.error.hidden = true;
    els.error.textContent = "";
  } catch (err) {
    els.input.classList.add("is-invalid");
    els.error.hidden = false;
    els.error.textContent = err.message || "Invalid equation";
  }
}

function setMode(next) {
  if (next === mode) return;
  mode = next;

  els.modeBtns.forEach((btn) => {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  const is2d = mode === "2d";
  els.canvas2d.classList.toggle("is-active", is2d);
  els.canvas3d.classList.toggle("is-active", !is2d);
  els.controls2d.hidden = !is2d;
  els.controls3d.hidden = is2d;
  els.hint2d.hidden = !is2d;
  els.hint3d.hidden = is2d;
  els.prefix.textContent = is2d ? "y =" : "z =";

  if (is2d) {
    view3d.deactivate();
    els.input.value = els.input.dataset.last2d || "x^2";
    view2d.activate();
  } else {
    els.input.dataset.last2d = els.input.value;
    els.input.value = els.input.dataset.last3d || "x^2 + y^2";
    view3d.activate();
  }

  renderPresets();
  applyEquation();
  if (!is2d) els.input.dataset.last3d = els.input.value;
}

els.modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

els.input.addEventListener("input", () => {
  if (mode === "2d") els.input.dataset.last2d = els.input.value;
  else els.input.dataset.last3d = els.input.value;
  applyEquation();
});

document.getElementById("btn-pan-left").addEventListener("click", () => view2d.panBy(-1));
document.getElementById("btn-pan-right").addEventListener("click", () => view2d.panBy(1));
document.getElementById("btn-reset-2d").addEventListener("click", () => view2d.reset());
document.getElementById("btn-snap-2d").addEventListener("click", () => view2d.snapCloser());
document.getElementById("btn-pan-3d-left").addEventListener("click", () => view3d.panBy(-0.8));
document.getElementById("btn-pan-3d-right").addEventListener("click", () => view3d.panBy(0.8));
document.getElementById("btn-reset-3d").addEventListener("click", () => view3d.resetCamera());
document.getElementById("btn-snap-3d").addEventListener("click", () => view3d.snapCloser());
document.getElementById("show-tangent-plane").addEventListener("change", (e) => {
  view3d.setShowPlane(e.target.checked);
});

window.addEventListener("resize", () => {
  if (mode === "2d") view2d.resize();
  else view3d.resize();
});

els.input.dataset.last2d = "x^2";
els.input.dataset.last3d = "x^2 + y^2";
renderPresets();
view2d.activate();
applyEquation();
