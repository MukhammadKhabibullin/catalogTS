import { BASE_HEIGHT, PAGE_HEIGHT, PAGE_WIDTH, sheetPoint } from './model.ts';
import type { SheetPose } from './model.ts';

export interface FramePoint {
  x: number;
  y: number;
  z: number;
}

export interface CameraFrameOptions {
  aspect: number;
  fovDegrees: number;
  viewportHeight: number;
  verticalOffsetPixels: number;
  safeInsetPixels: number;
  horizontalHalfExtent: number;
}

export interface ProjectedFramePoint {
  x: number;
  y: number;
}

export const CAMERA_PITCH = 10 * Math.PI / 180;
export const CAMERA_YAW = 0.035;
export const CAMERA_TARGET_Y = 0.02;
export const CAMERA_TARGET_Z = 0.05;

const normalize = (vector: FramePoint): FramePoint => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

const cross = (left: FramePoint, right: FramePoint): FramePoint => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const dot = (left: FramePoint, right: FramePoint): number => left.x * right.x + left.y * right.y + left.z * right.z;

export const CAMERA_BACK = normalize({ x: CAMERA_YAW, y: -Math.sin(CAMERA_PITCH), z: Math.cos(CAMERA_PITCH) });
export const CAMERA_RIGHT = normalize(cross({ x: 0, y: 1, z: 0 }, CAMERA_BACK));
export const CAMERA_UP = normalize(cross(CAMERA_BACK, CAMERA_RIGHT));

export function createStaticBookFrame(): FramePoint[] {
  const points: FramePoint[] = [];
  // Covers and paper stacks. The contact texture has transparent outer padding,
  // so framing its full plane would make the visible book unnecessarily small.
  for (const x of [-PAGE_WIDTH - 0.05, PAGE_WIDTH + 0.05]) for (const y of [-PAGE_HEIGHT / 2 - 0.03, PAGE_HEIGHT / 2 + 0.03]) {
    points.push({ x, y, z: -0.01 }, { x, y, z: BASE_HEIGHT + 0.15 });
  }
  points.push({ x: 0, y: -1.1, z: 0 }, { x: 0, y: 1.1, z: 0.31 });
  return points;
}

export function createSheetFrame(pose: SheetPose): FramePoint[] {
  const points: FramePoint[] = [];
  for (let widthStep = 0; widthStep <= 16; widthStep++) {
    const u = widthStep / 16;
    for (const v of [0, 0.5, 1]) points.push(sheetPoint(u, v, pose));
  }
  return points;
}

/** Samples the complete allowed page deformation, including both dragged corners. */
export function createBookTrajectoryFrame(): FramePoint[] {
  const points = createStaticBookFrame();
  const heights = [BASE_HEIGHT - 0.01, BASE_HEIGHT + 0.14];
  for (let progressStep = 0; progressStep <= 40; progressStep++) {
    const progress = progressStep / 40;
    for (const corner of [-1, 0, 1]) for (const startZ of heights) for (const endZ of heights) {
      points.push(...createSheetFrame({ progress, startZ, endZ, rigid: false, corner }));
    }
  }
  return points;
}

export function projectFramePoint(point: FramePoint, distance: number, options: CameraFrameOptions): ProjectedFramePoint {
  const tangent = Math.tan(options.fovDegrees * Math.PI / 360);
  const relative = { x: point.x, y: point.y - CAMERA_TARGET_Y, z: point.z - CAMERA_TARGET_Z };
  const depth = distance - dot(relative, CAMERA_BACK);
  const verticalOffset = 2 * options.verticalOffsetPixels / options.viewportHeight * distance * tangent;
  return {
    x: dot(relative, CAMERA_RIGHT) / (depth * tangent * options.aspect),
    y: (dot(relative, CAMERA_UP) - verticalOffset) / (depth * tangent),
  };
}

/** Returns one stable camera distance that contains every sampled turn position. */
export function cameraDistanceForFrame(points: FramePoint[], options: CameraFrameOptions): number {
  const safeX = Math.max(0.5, 1 - 2 * options.safeInsetPixels / (options.viewportHeight * options.aspect));
  const safeY = Math.max(0.5, 1 - 2 * options.safeInsetPixels / options.viewportHeight);
  const horizontalPoints: FramePoint[] = [
    { x: -options.horizontalHalfExtent, y: 0, z: BASE_HEIGHT },
    { x: options.horizontalHalfExtent, y: 0, z: BASE_HEIGHT },
  ];
  const fits = (distance: number) => {
    for (const point of points) {
      const projected = projectFramePoint(point, distance, options);
      if (!Number.isFinite(projected.y) || projected.y < -safeY || projected.y > safeY) return false;
    }
    for (const point of horizontalPoints) {
      const projected = projectFramePoint(point, distance, options);
      if (!Number.isFinite(projected.x) || Math.abs(projected.x) > safeX) return false;
    }
    return true;
  };

  let low = 1;
  let high = 32;
  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;
    if (fits(middle)) high = middle;
    else low = middle;
  }
  return high;
}
