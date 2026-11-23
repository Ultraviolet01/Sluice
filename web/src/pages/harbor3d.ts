// The landing page's harbor in 3D: a Gerstner-wave ocean with fresnel
// reflection, sun glints and crest foam, and a container ship built from
// primitives in the design's palette that rides the swell. No external assets.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const C = {
  hull: 0x10303a,
  bootTop: 0x0b5c55,
  bottom: 0x7a2f2a,
  deck: 0x2b4952,
  house: 0xeef2f1,
  teal: 0x0b5c55,
  brass: 0xb07d24,
  slate: 0x56656c,
  pale: 0xdfe7e9,
  sky: 0xa9c9d2,
};

// ------------------------------------------------------------------ waves
// Direction (x, z), steepness, wavelength. Shared by the shader and the CPU
// so the ship sits exactly on the water it is drawn on.
const WAVES: [number, number, number, number][] = [
  [1.0, 0.25, 0.11, 52],
  [0.7, 0.9, 0.08, 31],
  [-0.4, 1.0, 0.06, 17],
  [0.9, -0.5, 0.035, 9],
];

function gerstner(x: number, z: number, t: number) {
  let dx = 0, dy = 0, dz = 0;
  for (const [ax, az, k, L] of WAVES) {
    const len = Math.hypot(ax, az);
    const d = [ax / len, az / len];
    const w = (2 * Math.PI) / L;
    const c = Math.sqrt(9.8 / w);
    const f = w * (d[0] * x + d[1] * z - c * t * 0.55);
    const a = k / w;
    dx += d[0] * a * Math.cos(f);
    dy += a * Math.sin(f);
    dz += d[1] * a * Math.cos(f);
  }
  return { dx, dy, dz };
}

const waveGLSL = WAVES.map(([x, z, k, L]) => `vec4(${x.toFixed(3)}, ${z.toFixed(3)}, ${k.toFixed(3)}, ${L.toFixed(1)})`).join(",\n  ");

const oceanVertex = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
const vec4 WAVES[${WAVES.length}] = vec4[${WAVES.length}](
  ${waveGLSL}
);
void main() {
  vec3 p = position.xzy; // plane is built in XY; use XZ as the sea
  p = vec3(position.x, 0.0, -position.y);
  vec3 disp = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < ${WAVES.length}; i++) {
    vec2 d = normalize(WAVES[i].xy);
    float k = WAVES[i].z;
    float w = 6.28318 / WAVES[i].w;
    float c = sqrt(9.8 / w);
    float f = w * (dot(d, p.xz) - c * uTime * 0.55);
    float a = k / w;
    disp += vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
    tangent += vec3(-d.x * d.x * k * sin(f), d.x * k * cos(f), -d.x * d.y * k * sin(f));
    binormal += vec3(-d.x * d.y * k * sin(f), d.y * k * cos(f), -d.y * d.y * k * sin(f));
  }
  vec3 world = (modelMatrix * vec4(p + disp, 1.0)).xyz;
  vWorld = world;
  vHeight = disp.y;
  vNormal = normalize(cross(binormal, tangent));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const oceanFragment = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  // Small ripples on top of the swell, from layered noise.
  vec2 q = vWorld.xz * 0.35;
  float e = 0.08;
  float n0 = noise(q + uTime * 0.3) + 0.5 * noise(q * 2.3 - uTime * 0.45);
  float nx = noise(q + vec2(e, 0.0) + uTime * 0.3) + 0.5 * noise((q + vec2(e, 0.0)) * 2.3 - uTime * 0.45);
  float nz = noise(q + vec2(0.0, e) + uTime * 0.3) + 0.5 * noise((q + vec2(0.0, e)) * 2.3 - uTime * 0.45);
  vec3 n = normalize(vNormal + vec3(n0 - nx, 0.0, n0 - nz) * 0.7);

  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = (0.02 + 0.98 * pow(1.0 - max(dot(n, view), 0.0), 5.0)) * 0.55;
  vec3 refl = reflect(-view, n);
  vec3 skyCol = mix(uHorizon, uSky, clamp(refl.y * 1.6, 0.0, 1.0));

  float depthMix = clamp(vHeight * 0.9 + 0.55, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, depthMix * 0.55);
  // Light passing through the crests.
  float sss = pow(max(dot(view, -uSun), 0.0), 3.0) * clamp(vHeight, 0.0, 1.0);
  water += vec3(0.10, 0.28, 0.26) * sss;

  vec3 col = mix(water, skyCol, fresnel);
  vec3 h = normalize(uSun + view);
  col += vec3(1.0, 0.96, 0.86) * pow(max(dot(n, h), 0.0), 420.0) * 2.4;

  // Foam on the steepest crests.
  float foam = smoothstep(0.62, 1.0, vHeight + 0.3 * noise(vWorld.xz * 1.7 + uTime));
  col = mix(col, vec3(0.92, 0.96, 0.96), foam * 0.35);

  // Fade into the page's haze towards the horizon.
  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uHorizon, smoothstep(140.0, 330.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ textures

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Corrugated container side: vertical ribs and a door frame line. */
const ribs = () =>
  canvasTexture(128, 64, (g) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 6) {
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(x, 0, 2, 64);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x + 3, 0, 1, 64);
    }
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(0, 0, 128, 3);
    g.fillRect(0, 61, 128, 3);
  });

const windows = () =>
  canvasTexture(256, 256, (g) => {
    g.fillStyle = "#eef2f1";
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 9; col++) {
        g.fillStyle = row === 0 ? "#1d3a44" : "#2c4650";
        g.fillRect(14 + col * 27, 18 + row * 48, 16, row === 0 ? 20 : 12);
      }
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(0, 44 + row * 48, 256, 3);
    }
  });

/** The hull side: ship name near the bow and the load-line mark amidships. */
const hullSide = (length: number) =>
  canvasTexture(2048, 256, (g) => {
    g.clearRect(0, 0, 2048, 256);
    g.fillStyle = "#f6f8f7";
    g.font = "600 64px Fraunces, Georgia, serif";
    g.textAlign = "center";
    g.fillText("S L U I C E", 2048 * (1 - 13 / length), 92);
    // Plimsoll mark: ring and bar in brass, with the line label.
    const cx = 1024, cy = 178;
    g.strokeStyle = "#c9952e";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, cy, 30, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 62, cy);
    g.lineTo(cx + 62, cy);
    g.stroke();
    g.fillStyle = "rgba(246,248,247,0.85)";
    g.font = "500 30px 'Hanken Grotesk', sans-serif";
    g.textAlign = "left";
    g.fillText("YOUR LINE · 100 tUSD8", cx + 84, cy + 10);
  });

// ------------------------------------------------------------------ the ship

function buildShip() {
  const ship = new THREE.Group();
  const L = 64, B = 11, D = 6.2; // length, beam, depth
  const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...extra });

  // Hull: a deck-plan outline (square stern, fine bow) extruded downwards.
  const plan = new THREE.Shape();
  plan.moveTo(-L / 2, -B / 2);
  plan.lineTo(L / 2 - 13, -B / 2);
  plan.bezierCurveTo(L / 2 - 4, -B / 2, L / 2, -2, L / 2 + 1.5, 0);
  plan.bezierCurveTo(L / 2, 2, L / 2 - 4, B / 2, L / 2 - 13, B / 2);
  plan.lineTo(-L / 2, B / 2);
  plan.lineTo(-L / 2, -B / 2);
  const band = (y0: number, h: number, color: number, scale = 1) => {
    const g = new THREE.ExtrudeGeometry(plan, { depth: h, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 24 });
    g.rotateX(Math.PI / 2);
    g.translate(0, y0 + h, 0);
    g.scale(1, 1, scale);
    const m = new THREE.Mesh(g, std(color, { roughness: 0.45 }));
    ship.add(m);
    return m;
  };
  band(-3.2, 2.2, C.bottom, 0.96); // under water
  band(-1.0, 0.7, C.bootTop, 0.985); // boot-top at the waterline
  band(-0.3, D - 3.0, C.hull, 1.0); // topsides

  // Name and load line on both sides.
  const side = hullSide(L);
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, L / 8), new THREE.MeshBasicMaterial({ map: side, transparent: true, depthWrite: false }));
    p.position.set(0, 1.0, s * (B / 2 + 0.27));
    if (s < 0) p.rotation.y = Math.PI;
    p.scale.x = s;
    ship.add(p);
  }

  // Deck.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L - 6, 0.25, B - 0.6), std(C.deck));
  deck.position.set(-2, D - 3.2, 0);
  ship.add(deck);

  // Containers: bays along the deck, rows across, uneven stacks.
  const rib = ribs();
  const box = new THREE.BoxGeometry(5.6, 2.4, 2.35);
  const palette = [C.teal, C.teal, C.brass, C.slate, C.pale, C.sky, C.teal, C.slate];
  const bays = 8, rows = 4;
  const count = bays * rows * 5;
  const containers = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: rib, roughness: 0.55, metalness: 0.25 }), count);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let i = 0;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < bays; b++) {
    for (let r = 0; r < rows; r++) {
      const tiers = 2 + Math.floor(rand() * (b > 0 && b < bays - 1 ? 4 : 3));
      for (let t = 0; t < tiers && i < count; t++) {
        m4.makeTranslation(-12 + b * 5.9 - 0.4, D - 1.85 + t * 2.45, -3.6 + r * 2.4);
        containers.setMatrixAt(i, m4);
        containers.setColorAt(i, col.setHex(palette[Math.floor(rand() * palette.length)]));
        i++;
      }
    }
  }
  containers.count = i;
  ship.add(containers);

  // Superstructure aft: the house, bridge wings, funnel and mast.
  const houseMat = new THREE.MeshStandardMaterial({ map: windows(), roughness: 0.5 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(6, 11, B - 1.6), [std(C.house), std(C.house), std(C.house), std(C.house), houseMat, houseMat]);
  house.position.set(-L / 2 + 5.5, D - 3 + 5.5, 0);
  ship.add(house);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, B + 2), std(C.house));
  wings.position.set(-L / 2 + 6.5, D - 3 + 10.6, 0);
  ship.add(wings);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 4.2, 24), std(C.teal, { roughness: 0.4 }));
  funnel.position.set(-L / 2 + 3.2, D - 3 + 13, 0);
  ship.add(funnel);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.23, 1.28, 0.7, 24), std(C.brass, { metalness: 0.5, roughness: 0.35 }));
  stripe.position.set(-L / 2 + 3.2, D - 3 + 13.6, 0);
  ship.add(stripe);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), std(0x1d3a44));
  mast.position.set(-L / 2 + 7.2, D - 3 + 14, 0);
  ship.add(mast);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: C.brass, emissive: 0xffb84a, emissiveIntensity: 1.2 }));
  lamp.position.set(-L / 2 + 7.2, D - 3 + 17.1, 0);
  ship.add(lamp);

  ship.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return { ship, L };
}

// ------------------------------------------------------------------ scene

export interface Harbor {
  setOver(over: boolean): void;
  dispose(): void;
}

export function createHarbor(host: HTMLElement): Harbor {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const horizon = new THREE.Color(0xe9f0f0);
  scene.background = canvasTexture(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#c9dde3");
    grad.addColorStop(0.75, "#eef3f2");
    grad.addColorStop(1, "#f6f8f7");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });
  scene.fog = new THREE.Fog(horizon, 160, 320);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 600);
  const target = new THREE.Vector3(2, 3, 0);

  scene.add(new THREE.HemisphereLight(0xdfeef2, 0x1d3a44, 0.9));
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(60, 70, 40);
  scene.add(sun);
  const sunDir = sun.position.clone().normalize();

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700, 320, 320),
    new THREE.ShaderMaterial({
      vertexShader: oceanVertex,
      fragmentShader: oceanFragment,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: sunDir },
        uDeep: { value: new THREE.Color(0x0a2c36) },
        uShallow: { value: new THREE.Color(0x2f7580) },
        uSky: { value: new THREE.Color(0xa9c6cf) },
        uHorizon: { value: horizon },
      },
    }),
  );
  ocean.frustumCulled = false;
  scene.add(ocean);

  const { ship, L } = buildShip();
  scene.add(ship);

  let draft = 0, draftTarget = 0;
  let mx = 0, my = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    my = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: step back so the whole ship stays in frame.
    camera.fov = w / h < 1.4 ? 40 : 26;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const t = reduced ? 4 : clock.getElapsedTime();
    (ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    // Ride the swell: sample the water under bow, stern and both sides.
    const at = (x: number, z: number) => gerstner(x, z, t).dy;
    const bow = at(L / 2 - 6, 0), stern = at(-L / 2 + 6, 0);
    const port = at(0, 5), stbd = at(0, -5), mid = at(0, 0);
    draft += (draftTarget - draft) * 0.02;
    ship.position.y = (bow + stern + mid) / 3 - 0.35 - draft;
    ship.rotation.z = Math.atan2(bow - stern, L - 12);
    ship.rotation.x = Math.atan2(port - stbd, 10) * 0.8;

    // A slow drift of the camera, nudged by the pointer.
    const swing = reduced ? 0 : Math.sin(t * 0.08) * 0.08;
    const ang = -0.62 + swing + mx * 0.06;
    const dist = 118;
    camera.position.set(Math.sin(ang) * dist, 15 + my * -2.5, Math.cos(ang) * dist);
    camera.lookAt(target);
    renderer.render(scene, camera);
  };
  frame();

  return {
    setOver(over) {
      draftTarget = over ? 1.1 : 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      renderer.dispose();
      pmrem.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      renderer.domElement.remove();
    },
  };
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
