import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { feature } from "topojson-client";
import { geoEquirectangular, geoPath, geoContains } from "d3-geo";
import {
  vertex,
  earthFragment,
  cloudFragment,
  atmosphereFragment,
  routeVertex,
  routeFragment,
} from "./shaders.js";
export function point(lat, lng, r = 1) {
  const a = (lat * Math.PI) / 180,
    b = (lng * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(a) * Math.cos(b) * r,
    Math.sin(a) * r,
    -Math.cos(a) * Math.sin(b) * r,
  );
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export class Earth {
  async init(stage, onPick, onInteraction) {
    this.stage = stage;
    this.onPick = onPick;
    this.mobile = innerWidth < 700;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x060b10, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 2.25 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute("aria-label", "ドラッグで地球を回転");
    this.renderer.domElement.setAttribute("tabindex", "0");
    stage.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.22;
    this.controls.maxDistance = 6;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.65;
    this.controls.autoRotateSpeed = 0.22;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.controls.minPolarAngle = 0.04;
    this.controls.maxPolarAngle = Math.PI - 0.04;
    this.auto = true;
    this.lastInteraction = performance.now();
    this.controls.addEventListener("start", () => {
      this.lastInteraction = performance.now();
      this.flight = null;
      this.controls.autoRotate = false;
      onInteraction?.();
    });
    this.controls.addEventListener(
      "end",
      () => (this.lastInteraction = performance.now()),
    );
    this.resize();
    this.camera.position.copy(point(24, 118, this.homeDistance));
    this.controls.update();
    this.time = 0;
    this.sun = point(15, 70);
    this.mask = document.createElement("canvas");
    this.mask.width = 2048;
    this.mask.height = 1024;
    this.maskTexture = new THREE.CanvasTexture(this.mask);
    const loader = new THREE.TextureLoader();
    this.highResolution = !(navigator.deviceMemory && navigator.deviceMemory < 4);
    const suffix = this.highResolution ? "4096.webp" : "2048.webp";
    const [day, night, detail, topo] = await Promise.all(
      ["day", "night", "bump_roughness_clouds"]
        .map((n) => loader.loadAsync(`./assets/earth_${n}_${suffix}`))
        .concat(fetch("./assets/countries-50m.json").then((r) => r.json())),
    );
    for (const t of [day, night, detail]) {
      t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      t.wrapS = THREE.RepeatWrapping;
    }
    this.features = feature(topo, topo.objects.countries).features;
    this.uniforms = {
      dayMap: { value: day },
      nightMap: { value: night },
      detailMap: { value: detail },
      visitMap: { value: this.maskTexture },
      sun: { value: this.sun },
      time: { value: 0 },
      clouds: { value: 1 },
      visits: { value: 1 },
    };
    const geometry = new THREE.SphereGeometry(1, 128, 64);
    this.earth = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: earthFragment,
        uniforms: this.uniforms,
      }),
    );
    this.scene.add(this.earth);
    this.clouds = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: cloudFragment,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.clouds.scale.setScalar(1.008);
    this.scene.add(this.clouds);
    this.atmosphere = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: atmosphereFragment,
        uniforms: this.uniforms,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.atmosphere.scale.setScalar(1.028);
    this.scene.add(this.atmosphere);
    this.routeGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.routeGroup, this.markerGroup);
    this.makeStars();
    this.makeGlow();
    this.labels = [];
    this.picks = [];
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    let down;
    this.renderer.domElement.addEventListener(
      "pointerdown",
      (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }),
    );
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (
        down &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 &&
        performance.now() - down.t < 600
      )
        this.pick(e.clientX, e.clientY);
      down = null;
    });
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      document.querySelector("#failure").hidden = false;
    });
    this.renderer.domElement.addEventListener("webglcontextrestored", () =>
      location.reload(),
    );
    this.renderer.domElement.addEventListener("keydown", (e) => {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "-",
          "Home",
        ].includes(e.key)
      ) {
        e.preventDefault();
        if (e.key === "Home") this.home();
        else if (e.key === "+" || e.key === "-")
          this.zoom(e.key === "+" ? 0.8 : 1.25);
        else {
          const s = new THREE.Spherical().setFromVector3(this.camera.position);
          s.theta +=
            e.key === "ArrowLeft" ? 0.12 : e.key === "ArrowRight" ? -0.12 : 0;
          s.phi +=
            e.key === "ArrowUp" ? -0.12 : e.key === "ArrowDown" ? 0.12 : 0;
          s.makeSafe();
          this.camera.position.setFromSpherical(s);
          this.controls.update();
        }
        this.lastInteraction = performance.now();
      }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.fps = null;
    this.frameTimes = [];
    this.samples = [];
    this.last = performance.now();
    this.start = performance.now();
    this.ready = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }
  resize() {
    const w = this.stage.clientWidth,
      h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const angle = Math.min(
      (this.camera.fov * Math.PI) / 360,
      Math.atan((Math.tan((this.camera.fov * Math.PI) / 360) * w) / h),
    );
    this.homeDistance = 1.13 / Math.sin(angle);
    if (this.ready && this.overview)
      this.focus(24, 118, this.homeDistance, 0.5);
  }
  makeStars() {
    let seed = 19;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const positions = [],
      colors = [];
    for (let i = 0; i < 1600; i++) {
      const v = point(
        (Math.asin(rand() * 2 - 1) * 180) / Math.PI,
        rand() * 360,
        35,
      );
      positions.push(v.x, v.y, v.z);
      const b = 0.18 + rand() * 0.45;
      colors.push(b * 0.85, b * 0.93, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.stars = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: this.mobile ? 0.032 : 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.scene.add(this.stars);
  }
  makeGlow() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "white");
    g.addColorStop(0.12, "white");
    g.addColorStop(0.3, "rgba(255,255,255,.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glow = new THREE.CanvasTexture(c);
  }
  setData(data, meta, selected = null) {
    this.data = data;
    this.meta = meta;
    this.selected = selected;
    this.drawCountries();
    for (const group of [this.routeGroup, this.markerGroup]) {
      for (const child of [...group.children]) {
        child.geometry?.dispose();
        child.material?.dispose();
        group.remove(child);
      }
    }
    this.labels.forEach((l) => l.el.remove());
    this.labels = [];
    this.picks = [];
    const markerPositions = [],
      markerSizes = [];
    for (const city of data.cities) {
      const position = point(city.lat, city.lng, 1.012);
      markerPositions.push(...position.toArray());
      markerSizes.push(5 + Math.sqrt(city.trips.length) * 2.5);
      this.picks.push({ city, position });
      const el = document.createElement("button");
      el.className = "city-label";
      el.textContent = city.name;
      if (city.trips.length > 1) {
        const small = document.createElement("small");
        small.textContent = `${city.trips.length}×`;
        el.append(small);
      }
      el.onclick = () => {
        this.onPick({ type: "city", data: city });
        this.focus(city.lat, city.lng, 1.95);
      };
      document.querySelector("#labels").append(el);
      this.labels.push({ el, position, city });
    }
    const markerGeometry = new THREE.BufferGeometry();
    markerGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(markerPositions, 3),
    );
    markerGeometry.setAttribute(
      "size",
      new THREE.Float32BufferAttribute(markerSizes, 1),
    );
    this.markerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(selected?.color || "#b6efd7") },
        ratio: { value: this.renderer.getPixelRatio() },
        time: { value: 0 },
      },
      vertexShader:
        "attribute float size; uniform float ratio,time; void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(36.,size*ratio*3.5/-mv.z)*(1.+.07*sin(time*2.));}",
      fragmentShader:
        "uniform vec3 color; void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*5.)*(1.-smoothstep(.6,1.,d));gl_FragColor=vec4(mix(color,vec3(1.),exp(-d*d*50.)),a);}",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.markerGroup.add(new THREE.Points(markerGeometry, this.markerMaterial));
    const routes = data.routes;
    const seen = new Set();
    this.routes = [];
    for (const route of routes) {
      const key = [
        route.from.lat,
        route.from.lng,
        route.to.lat,
        route.to.lng,
      ].join("|");
      if (!selected && seen.has(key)) continue;
      seen.add(key);
      const a = point(route.from.lat, route.from.lng),
        b = point(route.to.lat, route.to.lng),
        angle = a.angleTo(b);
      if (angle < 0.0001) continue;
      const height = Math.min(0.28, angle * 0.16) + 0.012;
      const points = [];
      for (let i = 0; i <= 72; i++) {
        const t = i / 72;
        const p = a
          .clone()
          .multiplyScalar(Math.sin((1 - t) * angle))
          .addScaledVector(b, Math.sin(t * angle))
          .divideScalar(Math.sin(angle))
          .normalize()
          .multiplyScalar(1.013 + Math.sin(Math.PI * t) * height);
        points.push(p);
      }
      const active = selected?.id === route.trip.id;
      const g = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        72,
        active ? 0.0015 : 0.001,
        4,
        false,
      );
      const progress = Array.from({ length: g.attributes.uv.count }, (_, i) =>
        g.attributes.uv.getX(i),
      );
      g.setAttribute("progress", new THREE.Float32BufferAttribute(progress, 1));
      const uniforms = {
        color: { value: new THREE.Color(route.trip.color) },
        time: { value: 0 },
        reveal: { value: 1 },
        opacity: {
          value: active
            ? 1
            : selected?.id?.length
              ? 0.1
              : route.kind === "flight"
                ? 0.6
                : 0.26,
        },
        record: { value: route.kind === "record" ? 1 : 0 },
      };
      const line = new THREE.Mesh(
        g,
        new THREE.ShaderMaterial({
          vertexShader: routeVertex,
          fragmentShader: routeFragment,
          uniforms,
          transparent: true,
          depthWrite: false,
        }),
      );
      this.routeGroup.add(line);
      this.routes.push({ line, trip: route.trip, route });
    }
    const batches = new Map();
    this.segmentCount = this.routes.length;
    for (const route of this.routes) {
      const key = `${route.trip.id}:${route.route.kind}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(route);
    }
    this.routes = [...batches.values()].map((batch) => {
      const first = batch[0];
      if (batch.length > 1) {
        const geometry = mergeGeometries(batch.map(r => r.line.geometry));
        for (const r of batch) {
          r.line.geometry.dispose();
          if (r !== first) { this.routeGroup.remove(r.line); r.line.material.dispose(); }
        }
        first.line.geometry = geometry;
      }
      return first;
    });
    this.routeGroup.visible = this.routesVisible !== false;
  }
  drawCountries() {
    const ctx = this.mask.getContext("2d");
    ctx.clearRect(0, 0, 2048, 1024);
    const projection = geoEquirectangular()
      .scale(2048 / (2 * Math.PI))
      .translate([1024, 512]);
    const path = geoPath(projection, ctx);
    const ids = new Set(this.data.countries.map((c) => this.meta[c.name]?.id));
    for (const f of this.features) {
      if (!ids.has(String(f.id).padStart(3, "0"))) continue;
      ctx.beginPath();
      path(f);
      const selected = this.meta[this.highlight]?.id === String(f.id).padStart(3,"0");
      ctx.fillStyle = selected ? "rgba(248,209,141,0.55)" : "rgba(90,205,170,0.33)";
      ctx.fill();
      ctx.strokeStyle = selected ? "#ffdea6" : "rgba(162,255,217,0.95)";
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();
    }
    if (ids.has("344")) {
      const p = projection([114.17, 22.3]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2, 0, Math.PI * 2);
      ctx.fillStyle = "#c4ffe4";
      ctx.fill();
    }
    this.maskTexture.needsUpdate = true;
  }
  focus(lat, lng, distance = 2.3, duration = 1.6) {
    if (distance < 2.8) this.upgradeTextures();
    this.lastInteraction = performance.now();
    this.controls.autoRotate = false;
    this.overview = false;
    const from = this.camera.position.clone();
    this.flight = {
      from,
      to: point(lat, lng, distance),
      start: performance.now(),
      duration: this.reduced ? 0.05 : duration,
    };
  }
  home() {
    this.focus(24, 118, this.homeDistance);
    this.overview = true;
  }
  async upgradeTextures() {
    if (!this.mobile || this.highResolution || this.upgrading || this.quality === 'eco' || performance.now() - (this.lastUpgradeAttempt || -60000) < 60000) return;
    this.lastUpgradeAttempt = performance.now();
    this.upgrading = true;
    try {
      const loader = new THREE.TextureLoader();
      const textures = await Promise.all(['day','night','bump_roughness_clouds'].map(n=>loader.loadAsync(`./assets/earth_${n}_4096.webp`)));
      for (const [i,key] of ['dayMap','nightMap','detailMap'].entries()) {
        textures[i].anisotropy = Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
        textures[i].wrapS = THREE.RepeatWrapping;
        this.uniforms[key].value.dispose();
        this.uniforms[key].value = textures[i];
      }
      this.highResolution = true;
    } catch { /* Keep the already rendered mobile textures if an upgrade is unavailable. */ }
    finally { this.upgrading = false; }
  }
  zoom(factor) {
    this.lastInteraction = performance.now();
    const d = THREE.MathUtils.clamp(
      this.camera.position.length() * factor,
      1.22,
      6,
    );
    const p = this.camera.position.clone().normalize();
    this.focus(
      (Math.asin(p.y) * 180) / Math.PI,
      (Math.atan2(-p.z, p.x) * 180) / Math.PI,
      d,
      0.45,
    );
  }
  pick(x, y) {
    const rect = this.stage.getBoundingClientRect();
    let best = null,
      nearest = 22;
    for (const p of this.picks) {
      if (!this.front(p.position)) continue;
      const s = p.position.clone().project(this.camera);
      const dx = rect.left + ((s.x + 1) * rect.width) / 2 - x,
        dy = rect.top + ((1 - s.y) * rect.height) / 2 - y;
      const dist = Math.hypot(dx, dy);
      if (dist < nearest) {
        nearest = dist;
        best = p.city;
      }
    }
    if (best) {
      this.onPick({ type: "city", data: best });
      this.focus(best.lat, best.lng, 1.95);
      return;
    }
    this.ndc.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObject(this.earth)[0];
    if (!hit) return;
    const n = hit.point.normalize();
    const lat = (Math.asin(n.y) * 180) / Math.PI,
      lng = (Math.atan2(-n.z, n.x) * 180) / Math.PI;
    const f = this.features.find((f) => geoContains(f, [lng, lat]));
    if (f) {
      const name =
        Object.values(this.meta).find(
          (c) => c.id === String(f.id).padStart(3, "0"),
        )?.name || f.properties.name;
      this.onPick({ type: "country", data: { name, lat, lng } });
      this.focus(lat, lng, 2.25);
    }
  }
  front(p) {
    return p.dot(this.camera.position) > 1.015;
  }
  labelsFrame() {
    const w = this.stage.clientWidth,
      h = this.stage.clientHeight,
      d = this.camera.position.length();
    const boxes = [];
    const list = [...this.labels].sort(
      (a, b) => b.city.trips.length - a.city.trips.length,
    );
    let shown = 0;
    for (const l of list) {
      let visible = this.front(l.position);
      const s = l.position.clone().project(this.camera);
      const x = ((s.x + 1) * w) / 2 + 9,
        y = ((1 - s.y) * h) / 2 - 10;
      const width = Math.min(145, l.city.name.length * 6 + 25);
      visible =
        visible &&
        x > 0 &&
        x + width < w - 8 &&
        y > 10 &&
        y < h - 30 &&
        shown < (d < 2.6 ? 12 : 5);
      if (
        visible &&
        boxes.some(
          (b) =>
            x < b.x + b.w + 8 && x + width > b.x - 8 && Math.abs(y - b.y) < 25,
        )
      )
        visible = false;
      l.el.hidden = !visible;
      if (visible) {
        l.el.style.transform = `translate(${x}px,${y}px)`;
        boxes.push({ x, y, w: width });
        shown++;
      }
    }
  }
  frame() {
    const now = performance.now(), elapsed = (now - this.last) / 1000,
      dt = Math.min(elapsed, 0.06);
    this.last = now;
    if (document.hidden) return;
    this.time += dt;
    if (this.camera.position.length()<2.8) this.upgradeTextures();
    if (this.lightMode === 'live' && (!this.lastSun || now-this.lastSun>60000)) { this.setLight('live'); this.lastSun=now; }
    this.uniforms.time.value = this.time;
    this.clouds.visible = this.uniforms.clouds.value > 0;
    if (this.flight) {
      const f = this.flight,
        t = Math.min(1, (now - f.start) / (f.duration * 1000)),
        k = ease(t);
      const q = new THREE.Quaternion().setFromUnitVectors(
        f.from.clone().normalize(),
        f.to.clone().normalize(),
      );
      const rotation = new THREE.Quaternion().slerp(q, k);
      this.camera.position
        .copy(f.from)
        .normalize()
        .applyQuaternion(rotation)
        .multiplyScalar(
          THREE.MathUtils.lerp(f.from.length(), f.to.length(), k),
        );
      if (t === 1) this.flight = null;
    }
    this.controls.autoRotate =
      this.auto &&
      !this.replaying &&
      !this.flight &&
      !this.reduced &&
      now - this.lastInteraction > 10000;
    this.controls.update(dt);
    for (const r of this.routes || [])
      r.line.material.uniforms.time.value = this.reduced ? 0 : this.time;
    this.onFrame?.(elapsed);
    if (this.markerMaterial) {
      this.markerMaterial.uniforms.time.value = this.reduced ? 0 : this.time;
      this.markerMaterial.uniforms.ratio.value = this.renderer.getPixelRatio();
    }
    this.labelsFrame();
    this.renderer.render(this.scene, this.camera);
    this.samples.push(elapsed);
    this.frameTimes.push(elapsed*1000);
    if(this.frameTimes.length>240)this.frameTimes.shift();
    if (this.samples.length >= 120) {
      this.fps = Math.round(
        this.samples.length / this.samples.reduce((a, b) => a + b, 0),
      );
      this.samples = [];
      if (
        this.fps < 43 &&
        (!this.quality || this.quality === "auto") &&
        this.renderer.getPixelRatio() > 1
      ) {
        this.renderer.setPixelRatio(
          Math.max(1, this.renderer.getPixelRatio() - 0.2),
        );
        this.resize();
      }
    }
  }
  setReveal(index, progress) {
    for (const r of this.routes)
      r.line.material.uniforms.reveal.value =
        r.trip.index === index ? Math.min(1, progress * 1.4) : 1;
  }
  setLight(mode) {
    if (mode === "live") {
      const now = new Date(),
        day = (Date.now() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000;
      const lat = 23.44 * Math.sin(((day - 81) * 2 * Math.PI) / 365.25),
        lng = 180 - (now.getUTCHours() + now.getUTCMinutes() / 60) * 15;
      this.sun.copy(point(lat, lng));
    } else this.sun.copy(point(15, 70));
  }
  metrics() {
    const frames = [...this.frameTimes].sort((a,b)=>a-b);
    return {
      fps: this.fps,
      frameTimeMedian: frames[Math.floor(frames.length*.5)] || null,
      frameTimeP95: frames[Math.floor(frames.length*.95)] || null,
      jsHeapMiB: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null,
      textureResolution: this.highResolution ? 4096 : 2048,
      pixelRatio: this.renderer.getPixelRatio(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      textures: this.renderer.info.memory.textures,
      geometries: this.renderer.info.memory.geometries,
      camera: this.camera.position.toArray(),
      routes: this.segmentCount,
      cities: this.picks.length,
    };
  }
}
