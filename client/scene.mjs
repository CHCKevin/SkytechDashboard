import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '/vendor/CSS2DRenderer.js';
import { EffectComposer } from '/vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/postprocessing/OutputPass.js';
import { computeLayout, cameraPreset } from './layout-3d.mjs';
import { createShipFleet } from './ships.mjs';
import { createSky, glowTexture } from './sky.mjs';
import { createPlanetLooks } from './planet-look.mjs';
import { planetLabel } from './view-model.mjs';

const BATCH_SIZE = 200;
const LABEL_DISTANCE = 140;
const FLIGHT_MS = 700;
const CLICK_TOLERANCE = 5;

export function createScene(container, { onPickProject, onPickWorkPackage, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Neutral 色調映射保留色相與飽和度，狀態顏色仍能對照圖例。
  renderer.toneMapping = THREE.NeutralToneMapping;
  container.append(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020309);
  // 環境光偏暗，星球才有明顯的亮面與暗面。
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  sun.position.set(200, 300, 100);
  const sky = createSky();
  scene.add(sun, sky);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.maxDistance = 2000;

  // 泛光：只有高亮處（恆星、星系核心、大氣邊緣）會向外發光。
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.6));
  composer.addPass(new OutputPass());

  const coreGeometry = new THREE.SphereGeometry(3.5, 32, 16);
  // 星系核心是一顆恆星：亮度超過泛光門檻，自然形成光暈；外圈以柔光 sprite 表現星系盤的微光。
  const coreMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf5ecff).multiplyScalar(1.6) });
  const glow = glowTexture();
  const glowSprite = (color, opacity, scale) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.scale.setScalar(scale);
    return sprite;
  };
  const looks = createPlanetLooks();

  const galaxies = new Map();
  const planets = new Map();
  const fleet = createShipFleet(scene);
  let pending = [];
  let total = 0;
  let view = { mode: 'overview', projectId: null };
  let selectedId = null;
  let crew = null; // { id, people }
  let flight = null;
  let layout = computeLayout({ projects: [], workPackages: [] });

  function label(text, className) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return new CSS2DObject(element);
  }

  function removeObject(object) {
    object.traverse(child => { if (child.isCSS2DObject) child.element.remove(); });
    scene.remove(object);
  }

  function addGalaxy(project) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.userData = { kind: 'project', id: project.id };
    const corona = glowSprite(0xc9b2ff, 0.55, 16);
    const halo = glowSprite(0x7c3aed, 0.22, 1);
    const tag = label('', 'galaxy-label');
    tag.position.set(0, 6.5, 0);
    group.add(core, corona, halo, tag);
    scene.add(group);
    galaxies.set(project.id, { group, core, halo, tag });
  }

  function addPlanet(wp) {
    // root 管位置、顯示、縮放與標籤；surface 負責點選與自轉。
    const look = looks.create(wp);
    look.surface.userData = { kind: 'work-package', id: wp.id };
    const tag = label('', 'planet-label');
    tag.position.set(0, 2.6, 0);
    look.root.add(tag);
    scene.add(look.root);
    const planet = { ...look, tag, wp };
    planets.set(wp.id, planet);
    updatePlanet(planet, wp);
    // 選取的星球若仍在分批佇列中，建立後才補上太空船。
    if (crew?.id === wp.id) fleet.show(look.root.position, crew.people);
  }

  function updatePlanet(planet, wp) {
    planet.wp = wp;
    looks.restyle(planet, wp.status.color);
    planet.root.position.set(...layout.planets.get(wp.id));
    planet.tag.element.textContent = planetLabel(wp);
    planet.root.visible = view.mode === 'universe' || (view.mode === 'galaxy' && wp.projectId === view.projectId);
    planet.root.scale.setScalar(wp.id === selectedId ? 1.8 : 1);
  }

  function refreshPlanets() {
    for (const planet of planets.values()) updatePlanet(planet, planet.wp);
  }

  // 依 ID 增刪物件，不重建控制器；位置由佈局決定，新項目排在外圈，既有星球不動。
  function setData(snapshot) {
    const firstData = layout.galaxies.size === 0;
    layout = computeLayout(snapshot);
    // 初始視角是在沒有資料時算的；第一次拿到資料後依實際範圍重新取景。
    if (firstData && layout.galaxies.size > 0) flyTo(cameraPreset(view, layout));
    const counts = new Map();
    for (const wp of snapshot.workPackages) counts.set(wp.projectId, (counts.get(wp.projectId) ?? 0) + 1);
    const projectIds = new Set(snapshot.projects.map(project => project.id));
    for (const [id, galaxy] of galaxies) {
      if (!projectIds.has(id)) { removeObject(galaxy.group); galaxies.delete(id); }
    }
    for (const project of snapshot.projects) {
      if (!galaxies.has(project.id)) addGalaxy(project);
      const galaxy = galaxies.get(project.id);
      const { center, radius } = layout.galaxies.get(project.id);
      galaxy.group.position.set(...center);
      galaxy.halo.scale.setScalar(radius * 1.9);
      galaxy.tag.element.textContent = `${project.name}（${counts.get(project.id) ?? 0}）`;
    }
    const ids = new Set(snapshot.workPackages.map(wp => wp.id));
    for (const [id, planet] of planets) {
      if (!ids.has(id)) { removeObject(planet.root); planets.delete(id); }
    }
    pending = [];
    const queued = new Set();
    for (const wp of snapshot.workPackages) {
      if (planets.has(wp.id)) updatePlanet(planets.get(wp.id), wp);
      else if (!queued.has(wp.id)) { queued.add(wp.id); pending.push(wp); }
    }
    total = snapshot.workPackages.length;
    onProgress(planets.size, total);
    // 選取的星球消失時移除太空船但保留 crew，星球回來時由 addPlanet 補上。
    if (crew && !planets.has(crew.id)) fleet.clear();
  }

  // 全宇宙大量星球分批加入，避免單一畫格卡住；進度回報已呈現／總數。
  function addPendingBatch() {
    if (!pending.length) return;
    for (const wp of pending.splice(0, BATCH_SIZE)) addPlanet(wp);
    onProgress(planets.size, total);
  }

  function updateLabels() {
    for (const planet of planets.values()) {
      const near = camera.position.distanceTo(planet.root.position) < LABEL_DISTANCE;
      planet.tag.visible = planet.wp.id === selectedId || near;
    }
  }

  function flyTo({ position, target }) {
    // 先套用並清除拖曳留下的慣性；否則畫格慢時，飛行結束後殘留的阻尼會讓視角繼續漂移。
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    flight = {
      start: performance.now(),
      fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
      toPosition: new THREE.Vector3(...position), toTarget: new THREE.Vector3(...target),
    };
  }

  function setView(next) {
    view = next;
    refreshPlanets();
    flyTo(cameraPreset(view, layout));
  }

  function select(id) {
    selectedId = id;
    crew = null;
    fleet.clear();
    refreshPlanets();
  }

  function showShips(id, people) {
    if (id !== selectedId) return;
    crew = { id, people };
    const planet = planets.get(id);
    if (planet) fleet.show(planet.root.position, people);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', event => {
    // 只有主要按鍵可點選；右鍵與中鍵留給平移與縮放。
    if (event.button !== 0) { down = null; return; }
    down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });
  renderer.domElement.addEventListener('pointerup', event => {
    const start = down;
    down = null;
    if (!start || event.pointerId !== start.pointerId) return;
    // 拖曳是旋轉或平移，不是點選。
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_TOLERANCE) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [
      ...[...galaxies.values()].map(galaxy => galaxy.core),
      ...[...planets.values()].filter(planet => planet.root.visible).map(planet => planet.surface),
    ];
    const [hit] = raycaster.intersectObjects(targets, false);
    if (!hit) return;
    const { kind, id } = hit.object.userData;
    if (kind === 'work-package') onPickWorkPackage(id);
    else onPickProject(id);
  });
  controls.addEventListener('start', () => { flight = null; });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    labelRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const initial = cameraPreset(view, layout);
  camera.position.set(...initial.position);
  controls.target.set(...initial.target);

  let lastTime = null;
  renderer.setAnimationLoop(time => {
    const seconds = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    addPendingBatch();
    if (flight) {
      const t = Math.min((performance.now() - flight.start) / FLIGHT_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
      if (t === 1) flight = null;
    }
    controls.update();
    // 背景跟著相機移動，看起來永遠在無限遠處。
    sky.position.copy(camera.position);
    for (const planet of planets.values()) {
      if (planet.root.visible) looks.animate(planet, seconds);
    }
    fleet.update(time);
    updateLabels();
    composer.render();
    labelRenderer.render(scene, camera);
  });

  return { setData, setView, select, showShips, resetView: () => flyTo(cameraPreset(view, layout)) };
}
