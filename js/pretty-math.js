/** Turn ascii math into HTML with superscripts, subscripts, and √ */

const SUPER = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻",
};

const SUB = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toSuper(str) {
  return [...String(str)].map((c) => SUPER[c] || c).join("");
}

function toSub(str) {
  return [...String(str)].map((c) => SUB[c] || c).join("");
}

/**
 * Pretty-print an expression for display.
 * Keeps the raw string for editing; this is visual only.
 */
export function prettyMathHtml(expr) {
  let s = String(expr ?? "").trim();
  if (!s) return "";

  // Protect function calls / structures with placeholders while formatting
  const parts = [];
  const keep = (html) => {
    const i = parts.length;
    parts.push(html);
    return `\uE000${i}\uE001`;
  };

  // sqrt(...) → √(...)
  s = s.replace(/\bsqrt\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`<span class="math-root">√<span class="math-radicand">${prettyMathHtml(inner)}</span></span>`)
  );

  // cbrt(...) → ∛(...)
  s = s.replace(/\bcbrt\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`<span class="math-root">∛<span class="math-radicand">${prettyMathHtml(inner)}</span></span>`)
  );

  s = s.replace(/\bln\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`ln(${prettyMathHtml(inner)})`)
  );
  s = s.replace(/\blg\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`log<sub>10</sub>(${prettyMathHtml(inner)})`)
  );

  // logbase5(...), logbase 5(...), logb5(...)
  s = s.replace(
    /\b(?:logbase|logb)\s*([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi,
    (_, base, inner) => keep(`log<sub>${escapeHtml(base)}</sub>(${prettyMathHtml(inner)})`)
  );

  // log_5(...), log_e(...), log_pi(...)
  s = s.replace(
    /\blog_([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi,
    (_, base, inner) => keep(`log<sub>${escapeHtml(base)}</sub>(${prettyMathHtml(inner)})`)
  );

  // log11(...), log10(...), log2(...) — digits glued to "log"
  s = s.replace(
    /\blog([0-9]+(?:\.[0-9]+)?)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi,
    (_, base, inner) => keep(`log<sub>${escapeHtml(base)}</sub>(${prettyMathHtml(inner)})`)
  );

  // log(x, base) / logb(x, base) / logbase(x, base) → log<sub>base</sub>(x)
  s = s.replace(
    /\b(?:log|logb|logbase)\s*\(\s*([^,()]+)\s*,\s*([^()]+)\s*\)/gi,
    (_, arg, base) => keep(`log<sub>${escapeHtml(base.trim())}</sub>(${prettyMathHtml(arg)})`)
  );

  // exp(...) → e^(...)
  s = s.replace(/\bexp\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`e<sup>${prettyMathHtml(inner)}</sup>`)
  );

  // abs(...) → |...|
  s = s.replace(/\babs\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (_, inner) =>
    keep(`|${prettyMathHtml(inner)}|`)
  );

  // Powers: x^2, x^-2, (x+1)^3, x^(2+y) → paper-style superscripts
  s = s.replace(/(\))(\^)(\([^()]*(?:\([^()]*\)[^()]*)*\))/g, (_, a, _c, exp) => {
    const inner = exp.slice(1, -1);
    return keep(`${a}<sup>${prettyMathHtml(inner)}</sup>`);
  });
  s = s.replace(/([a-zA-Z]|\)|\d)(\^)(-?\d+(?:\.\d+)?)/g, (_, base, _c, exp) =>
    keep(`${base}<sup>${escapeHtml(exp)}</sup>`)
  );
  s = s.replace(/([a-zA-Z]|\)|\d)(\^)(\([^()]*(?:\([^()]*\)[^()]*)*\))/g, (_, base, _c, exp) => {
    const inner = exp.slice(1, -1);
    return keep(`${base}<sup>${prettyMathHtml(inner)}</sup>`);
  });
  s = s.replace(/([a-zA-Z])(\^)([a-zA-Z])/g, (_, base, _c, exp) =>
    keep(`${base}<sup>${escapeHtml(exp)}</sup>`)
  );

  // * → · for nicer look (after functions handled)
  s = s.replace(/\*/g, "·");

  // Escape remaining plain text, then restore placeholders
  s = escapeHtml(s);
  s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => parts[Number(i)]);

  return s;
}

/** Unicode-only pretty label (presets / plain-text fallbacks) */
export function prettyMathText(expr) {
  let s = String(expr ?? "");
  s = s.replace(/\bsqrt\s*\(([^)]+)\)/gi, "√($1)");
  s = s.replace(/\blog([0-9]+(?:\.[0-9]+)?)\s*\(/gi, (_, b) => `log${toSub(b)}(`);
  s = s.replace(/\blog_([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(/gi, (_, b) => `log${toSub(b)}(`);
  s = s.replace(/\bln\s*\(/gi, "ln(");
  s = s.replace(/\*/g, "·");
  s = s.replace(/\^(-?\d+(?:\.\d+)?)/g, (_, n) => toSuper(n));
  return s;
}
