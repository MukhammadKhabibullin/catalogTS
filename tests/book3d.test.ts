import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentPage, HOLE_OFFSET, normalizePage, pageCount, PAGE_WIDTH, releaseShouldCommit, RING_CENTER_Z, RING_RADIUS, sheetPoint, spreadFor, stackHeights } from '../src/book3d/model.ts';
import { createSheetGeometry, deformSheet } from '../src/book3d/geometry.ts';
import { cameraDistanceForFrame, createBookTrajectoryFrame, projectFramePoint } from '../src/book3d/framing.ts';

test('book boundaries and spreads preserve all 103 fabric pages', () => {
  const total = pageCount(103);
  assert.equal(total, 106);
  assert.deepEqual(spreadFor(0, total, false), { left: null, right: 0 });
  assert.deepEqual(spreadFor(1, total, false), { left: 1, right: 2 });
  assert.deepEqual(spreadFor(103, total, false), { left: 103, right: 104 });
  assert.deepEqual(spreadFor(105, total, false), { left: 105, right: null });
  for (let fabric = 0; fabric < 103; fabric++) {
    const page = normalizePage(fabric + 1, total, false);
    assert.ok(Object.values(spreadFor(page, total, false)).includes(fabric + 1));
  }
});

test('navigation stops at either cover and supports single-page screens', () => {
  assert.equal(adjacentPage(0, -1, 106, false), 0);
  assert.equal(adjacentPage(0, 1, 106, false), 1);
  assert.equal(adjacentPage(1, -1, 106, false), 0);
  assert.equal(adjacentPage(103, 1, 106, false), 105);
  assert.equal(adjacentPage(105, 1, 106, false), 105);
  assert.equal(adjacentPage(105, -1, 106, false), 103);
  assert.equal(adjacentPage(49, 1, 106, true), 50);
  assert.equal(normalizePage(50, 106, false), 49);
  assert.equal(normalizePage(50, 106, true), 50);
});

test('stack thickness is conserved while moving to the other side', () => {
  for (const count of [1, 2, 3, 103, 104]) {
    const total = pageCount(count);
    const initial = stackHeights(0, total, false);
    let previous = 0;
    for (let page = 0; page < total; page++) {
      const heights = stackHeights(page, total, true);
      assert.ok(heights.left >= previous - 1e-10);
      assert.ok(Math.abs(heights.left + heights.right - initial.right) < 1e-10);
      assert.ok(heights.right >= -1e-10);
      previous = heights.left;
    }
    assert.equal(stackHeights(total - 1, total, false).right, 0);
  }
});

test('leaf settles flat at either endpoint, and rigid covers remain straight', () => {
  for (const progress of [0, 1]) for (const u of [0, 0.2, 0.5, 1]) {
    const point = sheetPoint(u, 0.4, { progress, startZ: 0.18, endZ: 0.09, rigid: false, corner: 1 });
    assert.ok(Math.abs(point.z - (progress === 0 ? 0.18 : 0.09)) < 1e-10);
  }
  for (const progress of [0.2, 0.5, 0.8]) {
    const pose = { progress, startZ: 0.18, endZ: 0.09, rigid: true, corner: 1 };
    const a = sheetPoint(0, 0.5, pose); const b = sheetPoint(1, 0.5, pose);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - PAGE_WIDTH) < 1e-10);
  }
});

test('binding holes follow the rings throughout the turn', () => {
  for (let index = 0; index <= 50; index++) {
    const point = sheetPoint(HOLE_OFFSET / PAGE_WIDTH, 0.5, { progress: index / 50, startZ: 0.185, endZ: 0.08, rigid: false, corner: -1 });
    assert.ok(Math.abs(Math.hypot(point.x, point.z - RING_CENTER_Z) - RING_RADIUS) < 1e-10);
  }
});

test('deformation keeps UV coordinates and actual sheet thickness', () => {
  const geometry = createSheetGeometry();
  const uv = Array.from(geometry.getAttribute('uv').array);
  const thickness = 0.014;
  deformSheet(geometry, { progress: 0.48, startZ: 0.18, endZ: 0.1, rigid: false, corner: 0.8 }, thickness);
  assert.deepEqual(Array.from(geometry.getAttribute('uv').array), uv);
  const positions = geometry.getAttribute('position');
  const half = positions.count / 2;
  for (let index = 0; index < half; index += 23) {
    const difference = Math.hypot(positions.getX(index) - positions.getX(index + half), positions.getY(index) - positions.getY(index + half), positions.getZ(index) - positions.getZ(index + half));
    assert.ok(Math.abs(difference - thickness) < 1e-6);
  }
  assert.ok(Array.from(positions.array).every(Number.isFinite));
  assert.equal(geometry.groups.length, 3);
  geometry.dispose();
});

test('short drags cancel while a deliberate turn or flick commits', () => {
  assert.equal(releaseShouldCommit(0.1, 0.1), false);
  assert.equal(releaseShouldCommit(0.001, 2), false);
  assert.equal(releaseShouldCommit(0.6, -0.1), true);
  assert.equal(releaseShouldCommit(0.15, 0.6), true);
});

test('camera framing contains the complete raised-page trajectory with safe insets', () => {
  const points = createBookTrajectoryFrame();
  const options = {
    aspect: 1.8,
    fovDegrees: 28,
    viewportHeight: 600,
    verticalOffsetPixels: 32,
    safeInsetPixels: 18,
    horizontalHalfExtent: (PAGE_WIDTH * 2 + 0.55) / 2,
  };
  const distance = cameraDistanceForFrame(points, options);
  const safeY = 1 - 2 * options.safeInsetPixels / options.viewportHeight;
  const projected = points.map((point) => projectFramePoint(point, distance, options));
  assert.ok(projected.every((point) => point.y >= -safeY - 1e-7 && point.y <= safeY + 1e-7));
  assert.ok(distance > 6 && distance < 20);

  const center = projectFramePoint({ x: 0, y: 0.02, z: 0.05 }, distance, options);
  assert.ok(Math.abs(center.y + 2 * options.verticalOffsetPixels / options.viewportHeight) < 1e-8);
});
