import * as THREE from 'three';
import { CSS2DObject } from '/vendor/CSS2DRenderer.js';
import { shipPosition } from './layout-3d.mjs';

const hullGeometry = new THREE.ConeGeometry(0.45, 1.4, 8).rotateX(Math.PI / 2);
const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x38bdf8, emissiveIntensity: 0.3 });

// 太空船只屬於目前選取的星球；切換或取消選取時整組移除。
export function createShipFleet(scene) {
  let group = null;
  let center = null;
  let ships = [];

  function clear() {
    if (!group) return;
    group.traverse(object => { if (object.isCSS2DObject) object.element.remove(); });
    scene.remove(group);
    group = null;
    ships = [];
  }

  function show(position, people) {
    clear();
    center = position;
    group = new THREE.Group();
    ships = people.map(person => {
      const ship = new THREE.Mesh(hullGeometry, hullMaterial);
      const element = document.createElement('div');
      element.className = 'ship-label';
      element.textContent = person.name;
      const tag = new CSS2DObject(element);
      tag.position.set(0, 1.4, 0);
      ship.add(tag);
      group.add(ship);
      return ship;
    });
    scene.add(group);
  }

  function update(time) {
    ships.forEach((ship, index) => {
      ship.position.set(...shipPosition(center, index, ships.length, time));
      ship.lookAt(...center);
    });
  }

  return { show, clear, update };
}
