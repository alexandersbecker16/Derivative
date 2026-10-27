# Derivative Lab

Interactive local visualizer for derivatives in **2D** and **3D**.

## Run locally

Double-click **`start.bat`**. It starts a small local server and opens
[http://localhost:5180](http://localhost:5180) in your default browser.

Or from a terminal in this folder:

```bash
python serve.py
```

Requires Python 3 (any recent version). No install step, no Node.

> ES modules and Three.js need a local server — opening `index.html` as a file will not work.

## Log bases

`ln(x)`, `log10(x)`, `log11(x)`, `log_5(x)`, `logbase5(x)`, `log(x, 5)` all work.

## What you can do

- Switch between **2D Plane** and **3D Surface**
- Type any equation (`y = …` or `z = …`) or pick a preset
- **2D:** drag the plane, zoom, drag two points on the curve — the secant line approaches the tangent
- **3D:** left-drag to pan, right-drag to rotate, scroll to zoom; drag **A / B / C** — the plane through them approaches the tangent plane

## Math notes

Uses [math.js](https://mathjs.org/) for expressions (`sin`, `cos`, `exp`, `abs`, `sqrt`, `^`, etc.) and numerical derivatives / gradients for the true tangent.
