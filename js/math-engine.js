/** Compile and evaluate user equations with math.js */

// Aliases students expect (math.js uses log for ln by default)
if (typeof math !== "undefined") {
  math.import(
    {
      ln: (...args) => math.log(...args),
      lg: (x) => math.log10(x),
      logb: (x, b) => math.log(x, b),
      logbase: (x, b) => math.log(x, b),
    },
    { override: true, silent: true }
  );
}

const KNOWN_CONSTANTS = new Set(["e", "pi", "i", "tau", "phi", "E", "PI"]);

export function compile1D(expr) {
  const cleaned = normalize(expr);
  const node = math.parse(cleaned);
  const code = node.compile();
  assertKnownFunctions(node);
  const vars = collectSymbols(node);
  if ([...vars].some((v) => v !== "x")) {
    throw new Error("2D equations may only use x (and functions like ln, log, sin, …)");
  }
  return (x) => {
    try {
      return sanitize(code.evaluate({ x }));
    } catch {
      return NaN;
    }
  };
}

export function compile2D(expr) {
  const cleaned = normalize(expr);
  const node = math.parse(cleaned);
  const code = node.compile();
  assertKnownFunctions(node);
  const vars = collectSymbols(node);
  for (const v of vars) {
    if (v !== "x" && v !== "y") {
      throw new Error("3D equations may only use x and y (and functions like ln, log, sin, …)");
    }
  }
  return (x, y) => {
    try {
      return sanitize(code.evaluate({ x, y }));
    } catch {
      return NaN;
    }
  };
}

export function numericalDerivative1D(f, x, h = 1e-5) {
  const yp = f(x + h);
  const ym = f(x - h);
  if (!Number.isFinite(yp) || !Number.isFinite(ym)) return NaN;
  return (yp - ym) / (2 * h);
}

export function numericalGradient(f, x, y, h = 1e-4) {
  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  return {
    fx: Number.isFinite(fx) ? fx : NaN,
    fy: Number.isFinite(fy) ? fy : NaN,
  };
}

export function formatNum(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e-10) return "0";
  if (Math.abs(n) >= 1e4 || (Math.abs(n) > 0 && Math.abs(n) < 1e-3)) {
    return n.toExponential(2);
  }
  return Number(n.toFixed(digits)).toString();
}

/**
 * Normalize student spellings into math.js.
 * Log bases: log11(x), log_5(x), logbase5(x), logbase(x,5), log(x,5), …
 */
export function normalize(expr) {
  let s = String(expr ?? "").trim();
  s = s.replace(/·/g, "*");

  // Fixed-name helpers
  s = s.replace(/\bln\s*\(/gi, "ln(");
  s = s.replace(/\blg\s*\(/gi, "lg(");

  // Any-base forms → log(arg, base)  (includes log10, log2, log11, …)
  s = rewriteAnyLogBase(s);

  // Implicit multiplication: 2x → 2*x, )x → )*x, )( → )*(
  s = s.replace(/(\d)\s*([a-zA-Z])/g, "$1*$2");
  s = s.replace(/\)\s*\(/g, ")*(");
  s = s.replace(/\)\s*([a-zA-Z])/g, ")*$1");
  return s;
}

/**
 * Rewrite every “log with a base” spelling into log(arg, base).
 * Handles nested parentheses.
 */
function rewriteAnyLogBase(expr) {
  // Patterns that introduce a base, then an opening '(' for the argument.
  // Capture groups: fullMatch start handled via index; base in group 1.
  const patterns = [
    // logbase5(  |  logbase 5(
    { re: /\blogbase\s*([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(/gi, baseGroup: 1 },
    // logb5(  |  logb 5(
    { re: /\blogb\s*([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(/gi, baseGroup: 1 },
    // log_5(  |  log_e(
    { re: /\blog_([0-9]+(?:\.[0-9]+)?|e|pi)\s*\(/gi, baseGroup: 1 },
    // log11(  |  log10(  |  log2(  — digits glued to "log"
    { re: /\blog([0-9]+(?:\.[0-9]+)?)\s*\(/gi, baseGroup: 1 },
  ];

  let s = expr;
  for (const { re, baseGroup } of patterns) {
    s = rewritePrefixedLog(s, re, baseGroup);
  }

  // logbase(x, base) / logb(x, base) → log(x, base)  (already math.js-friendly names,
  // but normalize to log so one code path evaluates)
  s = rewriteTwoArgLogAlias(s, /\b(?:logbase|logb)\s*\(/gi);

  return s;
}

function rewritePrefixedLog(expr, re, baseGroup) {
  let out = "";
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(expr)) !== null) {
    const base = m[baseGroup];
    const open = m.index + m[0].length - 1;
    const closed = findMatchingParen(expr, open);
    if (closed < 0) break;
    const inner = expr.slice(open + 1, closed);
    out += expr.slice(last, m.index) + `log(${inner}, ${base})`;
    last = closed + 1;
    re.lastIndex = last;
  }
  return out + expr.slice(last);
}

/** logbase(arg, base) / logb(arg, base) → log(arg, base) */
function rewriteTwoArgLogAlias(expr, re) {
  let out = "";
  let last = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(expr)) !== null) {
    const open = m.index + m[0].length - 1;
    const closed = findMatchingParen(expr, open);
    if (closed < 0) break;
    const inner = expr.slice(open + 1, closed);
    // Need exactly two top-level args
    const comma = findTopLevelComma(inner);
    if (comma < 0) {
      // single-arg — leave as-is for later parse error / skip
      out += expr.slice(last, closed + 1);
      last = closed + 1;
      re.lastIndex = last;
      continue;
    }
    const arg = inner.slice(0, comma).trim();
    const base = inner.slice(comma + 1).trim();
    out += expr.slice(last, m.index) + `log(${arg}, ${base})`;
    last = closed + 1;
    re.lastIndex = last;
  }
  return out + expr.slice(last);
}

function findMatchingParen(s, openIdx) {
  let depth = 1;
  for (let i = openIdx + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findTopLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}

/** Throw a readable error for calls like foo(x) that math.js doesn't know. */
function assertKnownFunctions(node) {
  node.traverse((n) => {
    if (!n.isFunctionNode || !n.fn || !n.fn.name) return;
    const name = n.fn.name;
    if (typeof math[name] === "function") return;
    throw new Error(
      `Unknown function "${name}". For logs try log11(x), log_11(x), or log(x, 11).`
    );
  });
}

function collectSymbols(node) {
  const symbols = new Set();
  const functionNames = new Set();

  node.traverse((n) => {
    if (n.isFunctionNode && n.fn && n.fn.name) {
      functionNames.add(n.fn.name);
    }
  });

  node.traverse((n) => {
    if (!n.isSymbolNode) return;
    const name = n.name;
    if (KNOWN_CONSTANTS.has(name)) return;
    if (functionNames.has(name)) return;
    if (typeof math[name] === "function") return;
    try {
      if (typeof math[name] === "function" || math.typeOf?.(math[name]) === "function") return;
    } catch {
      /* ignore */
    }
    symbols.add(name);
  });
  return symbols;
}

function sanitize(v) {
  if (typeof v === "object" && v !== null && typeof v.re === "number") {
    return v.im === 0 ? v.re : NaN;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export const PRESETS_2D = [
  { label: "x^2", expr: "x^2" },
  { label: "x^-2", expr: "x^-2" },
  { label: "sqrt(x)", expr: "sqrt(x)" },
  { label: "sin(x)", expr: "sin(x)" },
  { label: "ln(x)", expr: "ln(x)" },
  { label: "log10(x)", expr: "log10(x)" },
  { label: "logbase2(x)", expr: "logbase2(x)" },
  { label: "x^3 - 2*x", expr: "x^3 - 2*x" },
];

export const PRESETS_3D = [
  { label: "x^2 + y^2", expr: "x^2 + y^2" },
  { label: "sin(x)*cos(y)", expr: "sin(x)*cos(y)" },
  { label: "ln(x^2 + y^2)", expr: "ln(x^2 + y^2)" },
  { label: "sqrt(x^2 + y^2)", expr: "sqrt(x^2 + y^2)" },
  { label: "x*y", expr: "x*y" },
];
