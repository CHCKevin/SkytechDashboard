import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '/vendor/CSS2DRenderer.js';
import { galaxyCenter, planetPosition, cameraPreset } from './layout-3d.mjs';
import { createShipFleet } from './ships.mjs';

const BATCH_SIZE = 200;
const LABEL_DISTANCE = 90;
const FLIGHT_MS = 700;
const CLICK_TOLERANCE = 5;

export function createScene(container, { onPickProject, onPickWorkPackage, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(200, 300, 100);
  scene.add(sun, createStarfield());

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.maxDistance = 2000;

  const planetGeometry = new THREE.SphereGeometry(1.6, 24, 16);
  const coreGeometry = new THREE.SphereGeometry(5, 32, 16);
  const haloGeometry = new THREE.SphereGeometry(14, 32, 16);
  const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x7c3aed, emissiveIntensity: 0.8 });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x7c3aed, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const planetMaterials = new Map();

  const galaxies = new Map();
  const planets = new Map();
  const fleet = createShipFleet(scene);
  let pending = [];
  let total = 0;
  let view = { mode: 'overview', projectId: null };
  let selectedId = null;
  let flight = null;

  function label(text, className) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    return new CSS2DObject(element);
  }

  function materialFor(color) {
    if (!planetMaterials.has(color)) {
      planetMaterials.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.6 }));
    }
    return planetMaterials.get(color);
  }

  function removeObject(object) {
    object.traverse(child => { if (child.isCSS2DObject) child.element.remove(); });
    scene.remove(object);
  }

  function addGalaxy(project) {
    const group = new THREE.Group();
    group.position.set(...galaxyCenter(project.id));
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.userData = { kind: 'project', id: project.id };
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    const tag = label('', 'galaxy-label');
    tag.position.set(0, 9, 0);
    group.add(core, halo, tag);
    scene.add(group);
    galaxies.set(project.id, { group, core, tag });
  }

  function addPlanet(wp) {
    const mesh = new THREE.Mesh(planetGeometry, materialFor(wp.status.color));
    mesh.userData = { kind: 'work-package', id: wp.id };
    const tag = label('', 'planet-label');
    tag.position.set(0, 2.6, 0);
    mesh.add(tag);
    scene.add(mesh);
    const planet = { mesh, tag, wp };
    planets.set(wp.id, planet);
    updatePlanet(planet, wp);
  }

  function updatePlanet(planet, wp) {
    planet.wp = wp;
    planet.mesh.material = materialFor(wp.status.color);
    planet.mesh.position.set(...planetPosition(wp));
    planet.tag.element.textContent = wp.subject;
    planet.mesh.visible = view.mode === 'universe' || (view.mode === 'galaxy' && wp.projectId === view.projectId);
    planet.mesh.scale.setScalar(wp.id === selectedId ? 1.8 : 1);
  }

  function refreshPlanets() {
    for (const planet of planets.values()) updatePlanet(planet, planet.wp);
  }

  // 依 ID 增刪物件，不重建控制器，也不移動既有星系與星球。
  function setData(snapshot) {
    const counts = new Map();
    for (const wp of snapshot.workPackages) counts.set(wp.projectId, (counts.get(wp.projectId) ?? 0) + 1);
    const projectIds = new Set(snapshot.projects.map(project => project.id));
    for (const [id, galaxy] of galaxies) {
      if (!projectIds.has(id)) { removeObject(galaxy.group); galaxies.delete(id); }
    }
    for (const project of snapshot.projects) {
      if (!galaxies.has(project.id)) addGalaxy(project);
      galaxies.get(project.id).tag.element.textContent = `${project.name}（${counts.get(project.id) ?? 0}）`;
    }
    const ids = new Set(snapshot.workPackages.map(wp => wp.id));
    for (const [id, planet] of planets) {
      if (!ids.has(id)) { removeObject(planet.mesh); planets.delete(id); }
    }
    pending = [];
    for (const wp of snapshot.workPackages) {
      if (planets.has(wp.id)) updatePlanet(planets.get(wp.id), wp);
      else pending.push(wp);
    }
    total = snapshot.workPackages.length;
    onProgress(planets.size, total);
  }

  // 全宇宙大量星球分批加入，避免單一畫格卡住；進度回報已呈現／總數。
  function addPendingBatch() {
    if (!pending.length) return;
    for (const wp of pending.splice(0, BATCH_SIZE)) addPlanet(wp);
    onProgress(planets.size, total);
  }

  function updateLabels() {
    for (const planet of planets.values()) {
      const near = camera.position.distanceTo(planet.mesh.position) < LABEL_DISTANCE;
      planet.tag.visible = planet.wp.id === selectedId || near;
    }
  }

  function flyTo({ position, target }) {
    flight = {
      start: performance.now(),
      fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
      toPosition: new THREE.Vector3(...position), toTarget: new THREE.Vector3(...target),
    };
  }

  function setView(next) {
    view = next;
    refreshPlanets();
    flyTo(cameraPreset(view));
  }

  function select(id) {
    selectedId = id;
    fleet.clear();
    refreshPlanets();
  }

  function showShips(id, people) {
    const planet = planets.get(id);
    if (id !== selectedId || !planet) return;
    fleet.show(planet.mesh.position.toArray(), people);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    const start = down;
    down = null;
    // 拖曳是旋轉或平移，不是點選。
    if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > CLICK_TOLERANCE) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = [
      ...[...galaxies.values()].map(galaxy => galaxy.core),
      ...[...planets.values()].filter(planet => planet.mesh.visible).map(planet => planet.mesh),
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
    labelRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const initial = cameraPreset(view);
  camera.position.set(...initial.position);
  controls.target.set(...initial.target);

  renderer.setAnimationLoop(time => {
    addPendingBatch();
    if (flight) {
      const t = Math.min((performance.now() - flight.start) / FLIGHT_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
      if (t === 1) flight = null;
    }
    controls.update();
    fleet.update(time);
    updateLabels();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  return { setData, setView, select, showShips, resetView: () => flyTo(cameraPreset(view)) };
}

function createStarfield() {
  const count = 2000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const point = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 1500);
    positions.set(point.toArray(), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x94a3b8, size: 1.5, sizeAttenuation: false }));
}
