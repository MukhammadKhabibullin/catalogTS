import * as THREE from 'three';
import { BINDING_POSITIONS, HOLE_OFFSET, PAGE_HEIGHT, PAGE_WIDTH, sheetPoint } from './model.ts';
import type { SheetPose } from './model.ts';

const COLUMNS = 44;
const ROWS = 20;
const FACE_VERTICES = (COLUMNS + 1) * (ROWS + 1);

export function createSheetGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(FACE_VERTICES * 2 * 3);
  const uvs = new Float32Array(FACE_VERTICES * 2 * 2);
  const indices: number[] = [];
  for (let side = 0; side < 2; side++) {
    for (let row = 0; row <= ROWS; row++) for (let column = 0; column <= COLUMNS; column++) {
      const vertex = side * FACE_VERTICES + row * (COLUMNS + 1) + column;
      uvs[vertex * 2] = side === 0 ? column / COLUMNS : 1 - column / COLUMNS;
      uvs[vertex * 2 + 1] = row / ROWS;
    }
    const start = indices.length;
    for (let row = 0; row < ROWS; row++) for (let column = 0; column < COLUMNS; column++) {
      const a = side * FACE_VERTICES + row * (COLUMNS + 1) + column;
      const b = a + 1;
      const c = a + COLUMNS + 1;
      const d = c + 1;
      if (side === 0) indices.push(a, b, d, a, d, c);
      else indices.push(a, d, b, a, c, d);
    }
    geometry.addGroup(start, indices.length - start, side);
  }
  const start = indices.length;
  const edge: number[] = [];
  for (let column = 0; column <= COLUMNS; column++) edge.push(column);
  for (let row = 1; row <= ROWS; row++) edge.push(row * (COLUMNS + 1) + COLUMNS);
  for (let column = COLUMNS - 1; column >= 0; column--) edge.push(ROWS * (COLUMNS + 1) + column);
  for (let row = ROWS - 1; row > 0; row--) edge.push(row * (COLUMNS + 1));
  for (let index = 0; index < edge.length; index++) {
    const a = edge[index]; const b = edge[(index + 1) % edge.length];
    indices.push(a, a + FACE_VERTICES, b + FACE_VERTICES, a, b + FACE_VERTICES, b);
  }
  geometry.addGroup(start, indices.length - start, 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export function deformSheet(geometry: THREE.BufferGeometry, pose: SheetPose, thickness: number): void {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let row = 0; row <= ROWS; row++) for (let column = 0; column <= COLUMNS; column++) {
    const point = sheetPoint(column / COLUMNS, row / ROWS, pose);
    const normalX = -Math.sin(point.angle);
    const normalZ = Math.cos(point.angle);
    for (let side = 0; side < 2; side++) {
      const offset = (side === 0 ? 1 : -1) * thickness / 2;
      positions.setXYZ(side * FACE_VERTICES + row * (COLUMNS + 1) + column, point.x + normalX * offset, point.y, point.z + normalZ * offset);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

export function createHoleMask(back: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff'; context.fillRect(0, 0, 1024, 1024);
  context.fillStyle = '#000';
  for (const y of BINDING_POSITIONS) {
    context.beginPath();
    context.arc((back ? 1 - HOLE_OFFSET / PAGE_WIDTH : HOLE_OFFSET / PAGE_WIDTH) * 1024, (0.5 - y / PAGE_HEIGHT) * 1024, 0.026 / PAGE_WIDTH * 1024, 0, Math.PI * 2);
    context.fill();
  }
  return new THREE.CanvasTexture(canvas);
}
