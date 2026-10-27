import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { numericalGradient, formatNum } from "./math-engine.js";

const TEAL = 0x0d9f94;
const CORAL = 0xe85d3b;

export class View3D {
  constructor(canvas, onHud) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.f = (x, y) => x * x + y * y;
    this.showPlane = true;
    this.range = 3.2;

    // Three draggable surface points (uv = x,z on the domain)
    this.p1 = new THREE.Vector2(-1.7, 1.0);
    this.p2 = new THREE.Vector2(1.7, 1.0);
    this.p3 = new THREE.Vector2(0.0, -1.5);

    this.dragging = null; // 'p1' | 'p2' | 'p3'
    this._bound = false;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._ndcVec = new THREE.Vector3();
    this._panOffset = new THREE.Vector3();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(6.2, 4.6, 6.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 1.1;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 1.1;
    this.controls.target.set(0, 0.8, 0);
    // Left-drag pans (move around); right-drag rotates; scroll zooms
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    // Stop the browser context menu so right-drag can rotate
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(5, 10, 4);
    this.scene.add(amb, key);

    this.grid = new THREE.GridHelper(10, 20, 0x9bb4c4, 0xc5d4de);
    this.grid.position.y = -0.01;
    this.scene.add(this.grid);

    const axes = new THREE.AxesHelper(2.4);
    axes.position.y = 0.02;
    this.scene.add(axes);

    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.surfaceGroup);

    // Secant plane through A,B,C
    this.secantPlaneMesh = makePlaneMesh(CORAL, 0.4);
    this.scene.add(this.secantPlaneMesh);

    // True tangent plane (appears when points converge)
    this.tangentPlaneMesh = makePlaneMesh(TEAL, 0);
    this.tangentPlaneMesh.visible = false;
    this.scene.add(this.tangentPlaneMesh);

    this.triangleMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: CORAL,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.triangleMesh.frustumCulled = false;
    this.scene.add(this.triangleMesh);

    this.edgeAB = makeLine(CORAL);
    this.edgeBC = makeLine(CORAL);
    this.edgeCA = makeLine(CORAL);
    this.scene.add(this.edgeAB, this.edgeBC, this.edgeCA);

    // Invisible 3D anchors (HTML overlays track these)
    this.anchor1 = new THREE.Object3D();
    this.anchor2 = new THREE.Object3D();
    this.anchor3 = new THREE.Object3D();
    this.scene.add(this.anchor1, this.anchor2, this.anchor3);

    this._tmpColor = new THREE.Color();
    this._coral = new THREE.Color(CORAL);
    this._teal = new THREE.Color(TEAL);
    this._running = false;

    this._ensureOverlay();
    this.pointLayer.hidden = true; // only visible in 3D mode
  }

  _ensureOverlay() {
    const wrap = this.canvas.parentElement;
    let layer = wrap.querySelector(".point-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "point-layer";
      layer.hidden = true;
      layer.innerHTML = `
        <button type="button" class="drag-point" data-key="p1" aria-label="Point A">A</button>
        <button type="button" class="drag-point" data-key="p2" aria-label="Point B">B</button>
        <button type="button" class="drag-point" data-key="p3" aria-label="Point C">C</button>
      `;
      wrap.appendChild(layer);
    }
    this.pointLayer = layer;
    this.btn1 = layer.querySelector('[data-key="p1"]');
    this.btn2 = layer.querySelector('[data-key="p2"]');
    this.btn3 = layer.querySelector('[data-key="p3"]');
    this._pointBtns = [
      { key: "p1", uv: () => this.p1, el: this.btn1, anchor: this.anchor1 },
      { key: "p2", uv: () => this.p2, el: this.btn2, anchor: this.anchor2 },
      { key: "p3", uv: () => this.p3, el: this.btn3, anchor: this.anchor3 },
    ];
  }

  setFunction(f) {
    this.f = f;
    this.rebuildSurface();
    this.updateDerivatives();
  }

  setShowPlane(v) {
    this.showPlane = v;
    this.updateDerivatives();
  }

  activate() {
    this._ensureOverlay();
    this.pointLayer.hidden = false;
    if (!this._bound) {
      this._bind();
      this._bound = true;
    }
    this.resize();
    this.rebuildSurface();
    this.updateDerivatives();
    this._running = true;
    this._loop();
  }

  deactivate() {
    this._running = false;
    if (this.pointLayer) this.pointLayer.hidden = true;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._projectOverlays();
  }

  resetCamera() {
    this.camera.position.set(6.2, 4.6, 6.2);
    this.controls.target.set(0, 0.8, 0);
    this.controls.update();
  }

  /** Pan the camera view in world units along the view's right / up axes. */
  panBy(dx, dy = 0) {
    const cam = this.camera;
    const target = this.controls.target;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    right.setFromMatrixColumn(cam.matrix, 0).normalize();
    up.setFromMatrixColumn(cam.matrix, 1).normalize();
    this._panOffset.copy(right).multiplyScalar(-dx).addScaledVector(up, dy);
    cam.position.add(this._panOffset);
    target.add(this._panOffset);
    this.controls.update();
  }

  snapCloser() {
    const mid = this.p1.clone().add(this.p2).add(this.p3).multiplyScalar(1 / 3);
    const scale = 0.4;
    this.p1.lerp(mid, 1 - scale);
    this.p2.lerp(mid, 1 - scale);
    this.p3.lerp(mid, 1 - scale);
    const minSpread = 0.08;
    if (Math.max(this.p1.distanceTo(this.p2), this.p2.distanceTo(this.p3), this.p3.distanceTo(this.p1)) < minSpread * 2) {
      this.p1.set(mid.x - minSpread, mid.y - minSpread * 0.3);
      this.p2.set(mid.x + minSpread, mid.y - minSpread * 0.3);
      this.p3.set(mid.x, mid.y + minSpread);
    }
    this.clampPoints();
    this.updateDerivatives();
  }

  rebuildSurface() {
    const old = [...this.surfaceGroup.children];
    for (const c of old) {
      this.surfaceGroup.remove(c);
      c.geometry?.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }

    const res = 64;
    const geom = new THREE.PlaneGeometry(this.range * 2, this.range * 2, res, res);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = this.f(x, z);
      if (!Number.isFinite(y)) y = 0;
      y = Math.max(-8, Math.min(8, y));
      pos.setY(i, y);
      zMin = Math.min(zMin, y);
      zMax = Math.max(zMax, y);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();

    const colors = new Float32Array(pos.count * 3);
    const span = Math.max(1e-6, zMax - zMin);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - zMin) / span;
      const c = new THREE.Color().setHSL(0.48 - t * 0.18, 0.55, 0.42 + t * 0.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.12,
        roughness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    this.surfaceMesh = mesh;
    this.surfaceGroup.add(mesh);

    this.surfaceGroup.add(
      new THREE.LineSegments(
        new THREE.WireframeGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0x4a7a8a, transparent: true, opacity: 0.16 })
      )
    );
  }

  surfacePoint(uv) {
    const z = this.f(uv.x, uv.y);
    const y = Number.isFinite(z) ? Math.max(-8, Math.min(8, z)) : 0;
    return new THREE.Vector3(uv.x, y, uv.y);
  }

  clampPoints() {
    const r = this.range * 0.95;
    for (const p of [this.p1, this.p2, this.p3]) {
      p.x = THREE.MathUtils.clamp(p.x, -r, r);
      p.y = THREE.MathUtils.clamp(p.y, -r, r);
    }
  }

  updateDerivatives() {
    this.clampPoints();
    const A = this.surfacePoint(this.p1);
    const B = this.surfacePoint(this.p2);
    const C = this.surfacePoint(this.p3);

    this.anchor1.position.copy(A);
    this.anchor2.position.copy(B);
    this.anchor3.position.copy(C);

    setLine(this.edgeAB, A, B);
    setLine(this.edgeBC, B, C);
    setLine(this.edgeCA, C, A);
    setTriangle(this.triangleMesh, A, B, C);

    const midUv = this.p1.clone().add(this.p2).add(this.p3).multiplyScalar(1 / 3);
    const mid = this.surfacePoint(midUv);
    const grad = numericalGradient(this.f, midUv.x, midUv.y);
    const trueNormal = new THREE.Vector3(-grad.fx, 1, -grad.fy);
    if (trueNormal.lengthSq() > 1e-12) trueNormal.normalize();

    const ab = new THREE.Vector3().subVectors(B, A);
    const ac = new THREE.Vector3().subVectors(C, A);
    const secNormal = new THREE.Vector3().crossVectors(ab, ac);
    const area = secNormal.length();
    const degenerate = area < 1e-5;
    if (!degenerate) secNormal.normalize();

    const spread = Math.max(
      this.p1.distanceTo(midUv),
      this.p2.distanceTo(midUv),
      this.p3.distanceTo(midUv)
    );
    const delta = Math.max(
      this.p1.distanceTo(this.p2),
      this.p2.distanceTo(this.p3),
      this.p3.distanceTo(this.p1)
    );

    let align = 0;
    if (!degenerate && Number.isFinite(grad.fx)) {
      let ang = secNormal.angleTo(trueNormal);
      ang = Math.min(ang, Math.PI - ang);
      align = Math.max(0, 1 - ang / (Math.PI / 2));
    }
    const proximity = Math.max(0, Math.min(1, 1 - spread / 2.0));
    const blend = Math.max(align * proximity, proximity * proximity);

    const center = new THREE.Vector3().addVectors(A, B).add(C).multiplyScalar(1 / 3);
    const triSpan = Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A), 0.4);

    if (this.showPlane && !degenerate) {
      this.secantPlaneMesh.visible = true;
      placePlane(this.secantPlaneMesh, center, secNormal, triSpan * 1.4 + 0.4);
      this.secantPlaneMesh.material.opacity = 0.42 * (1 - blend * 0.55);
      this.secantPlaneMesh.material.color.copy(this._coral);
    } else {
      this.secantPlaneMesh.visible = false;
    }

    // True tangent plane fades in as points converge
    if (this.showPlane && Number.isFinite(grad.fx) && Number.isFinite(grad.fy) && blend > 0.35) {
      this.tangentPlaneMesh.visible = true;
      placePlane(this.tangentPlaneMesh, mid, trueNormal, 2.8);
      this.tangentPlaneMesh.material.opacity = (blend - 0.35) / 0.65 * 0.45;
    } else {
      this.tangentPlaneMesh.visible = false;
    }

    this.triangleMesh.material.opacity = 0.55 * (1 - blend * 0.4);

    let secFx = NaN;
    let secFy = NaN;
    if (!degenerate && Math.abs(secNormal.y) > 1e-6) {
      secFx = -secNormal.x / secNormal.y;
      secFy = -secNormal.z / secNormal.y;
    }

    if (this.onHud) {
      const isTangent = blend > 0.9;
      this.onHud({
        secant: `fx ${formatNum(secFx)}, fy ${formatNum(secFy)}`,
        deriv: `fx ${formatNum(grad.fx)}, fy ${formatNum(grad.fy)}`,
        derivLabel: "true ∇f",
        delta: formatNum(delta, 4),
        overlap: blend,
        caption: isTangent
          ? "Tangent plane drawn (points converged)"
          : blend > 0.45
            ? "Drawing tangent plane…"
            : "Drag A, B, C — plane connects them",
      });
    }

    this._projectOverlays();
  }

  _projectOverlays() {
    if (!this.pointLayer || this.pointLayer.hidden) return;
    const rect = this.canvas.getBoundingClientRect();
    for (const item of this._pointBtns) {
      const world = item.anchor.position;
      this._ndcVec.copy(world).project(this.camera);
      const x = (this._ndcVec.x * 0.5 + 0.5) * rect.width;
      const y = (-this._ndcVec.y * 0.5 + 0.5) * rect.height;
      const behind = this._ndcVec.z > 1;
      item.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      item.el.style.visibility = behind ? "hidden" : "visible";
      item.el.classList.toggle("is-dragging", this.dragging === item.key);
    }
  }

  _loop = () => {
    if (!this._running) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._projectOverlays();
    requestAnimationFrame(this._loop);
  };

  _bind() {
    // Point handles: stop orbit/pan so A/B/C can move on the surface
    for (const item of this._pointBtns) {
      item.el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dragging = item.key;
        this.controls.enabled = false;
        item.el.setPointerCapture(e.pointerId);
        item.el.classList.add("is-dragging");
      });

      item.el.addEventListener("pointermove", (e) => {
        if (this.dragging !== item.key) return;
        e.preventDefault();
        const uv = this._pickSurfaceUV(e);
        if (!uv) return;
        if (item.key === "p1") this.p1.copy(uv);
        if (item.key === "p2") this.p2.copy(uv);
        if (item.key === "p3") this.p3.copy(uv);
        this.updateDerivatives();
      });

      const end = (e) => {
        if (this.dragging !== item.key) return;
        this.dragging = null;
        this.controls.enabled = true;
        item.el.classList.remove("is-dragging");
        try {
          item.el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };
      item.el.addEventListener("pointerup", end);
      item.el.addEventListener("pointercancel", end);
    }
  }

  _ndc(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickSurfaceUV(e) {
    this._ndc(e);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    if (this.surfaceMesh) {
      const hits = this._raycaster.intersectObject(this.surfaceMesh, false);
      if (hits.length) {
        return new THREE.Vector2(hits[0].point.x, hits[0].point.z);
      }
    }
    // Fallback: horizontal plane through current centroid height
    const mid = this.surfacePoint(
      this.p1.clone().add(this.p2).add(this.p3).multiplyScalar(1 / 3)
    );
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -mid.y);
    const target = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(plane, target)) {
      return new THREE.Vector2(target.x, target.z);
    }
    return null;
  }
}

function makePlaneMesh(color, opacity) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      metalness: 0.05,
      roughness: 0.6,
      depthWrite: false,
    })
  );
}

function placePlane(mesh, center, normal, size) {
  mesh.position.copy(center);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  mesh.scale.set(size, size, 1);
}

function makeLine(color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    })
  );
  mesh.frustumCulled = false;
  return mesh;
}

function setLine(line, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-8) {
    line.visible = false;
    return;
  }
  line.visible = true;
  line.position.copy(a).add(b).multiplyScalar(0.5);
  line.scale.set(1, len, 1);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

function setTriangle(mesh, a, b, c) {
  const positions = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BufferGeometry();
  mesh.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  mesh.geometry.computeVertexNormals();
  mesh.visible = true;
}
