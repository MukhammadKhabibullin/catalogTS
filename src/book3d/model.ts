export const PAGE_WIDTH = 2.4;
export const PAGE_HEIGHT = 2.4;
export const BOARD_THICKNESS = 0.03;
export const SHEET_THICKNESS = 0.0016;
export const BASE_HEIGHT = 0.045;
export const RING_RADIUS = 0.145;
export const RING_CENTER_Z = 0.15;
export const HOLE_OFFSET = 0.105;
export const BINDING_POSITIONS = [-0.94, -0.313, 0.313, 0.94];

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function pageCount(fabricCount: number): number {
  return fabricCount + (fabricCount % 2 === 1 ? 3 : 2);
}

export function normalizePage(page: number, total: number, portrait: boolean): number {
  const bounded = clamp(Math.floor(page), 0, total - 1);
  return portrait || bounded === 0 || bounded === total - 1 ? bounded : bounded % 2 === 0 ? bounded - 1 : bounded;
}

export function adjacentPage(page: number, direction: -1 | 1, total: number, portrait: boolean): number {
  if (portrait) return clamp(page + direction, 0, total - 1);
  if (page === 0) return direction > 0 ? 1 : 0;
  if (page === total - 1) return direction < 0 ? total - 3 : page;
  return clamp(page + direction * 2, 0, total - 1);
}

export interface BookSpread {
  left: number | null;
  right: number | null;
}

export function spreadFor(page: number, total: number, portrait: boolean): BookSpread {
  if (portrait) return { left: null, right: page };
  if (page === 0) return { left: null, right: 0 };
  if (page === total - 1) return { left: page, right: null };
  return { left: page, right: page + 1 };
}

export function stackHeights(page: number, total: number, portrait: boolean): { left: number; right: number } {
  const leaves = total / 2;
  const turned = portrait ? page / (total - 1) * leaves : page === 0 ? 0 : page === total - 1 ? leaves : (page + 1) / 2;
  const weight = (count: number) => {
    const bounded = clamp(count, 0, leaves);
    return Math.min(bounded, 1) * BOARD_THICKNESS + clamp(bounded - 1, 0, leaves - 2) * SHEET_THICKNESS + Math.max(0, bounded - (leaves - 1)) * BOARD_THICKNESS;
  };
  const all = weight(leaves);
  return { left: weight(turned), right: Math.max(0, all - weight(turned)) };
}

export interface SheetPose {
  progress: number;
  startZ: number;
  endZ: number;
  rigid: boolean;
  corner: number;
}

/** The binding hole follows the metal ring; bending starts outside the binding strip. */
export function sheetPoint(u: number, v: number, pose: SheetPose): { x: number; y: number; z: number; angle: number } {
  const progress = clamp(pose.progress, 0, 1);
  const angle = Math.PI * progress;
  const fromAngle = Math.asin(clamp((pose.startZ - RING_CENTER_Z) / RING_RADIUS, -0.96, 0.96));
  const toAngle = Math.PI - Math.asin(clamp((pose.endZ - RING_CENTER_Z) / RING_RADIUS, -0.96, 0.96));
  const ringAngle = fromAngle + (toAngle - fromAngle) * progress;
  const holeX = Math.cos(ringAngle) * RING_RADIUS;
  const holeZ = Math.sin(ringAngle) * RING_RADIUS + RING_CENTER_Z;
  const bend = pose.rigid ? 0 : Math.sin(progress * Math.PI) * (0.9 + pose.corner * (v - 0.5) * 0.22);
  const distance = u * PAGE_WIDTH - HOLE_OFFSET;
  const steps = 18;
  let x = holeX;
  let z = holeZ;
  let tangent = angle;
  for (let index = 0; index < steps; index++) {
    const fraction = (index + 0.5) / steps;
    const at = Math.max(0, (HOLE_OFFSET + distance * fraction) / PAGE_WIDTH - 0.09) / 0.91;
    tangent = angle + bend * at * at;
    x += Math.cos(tangent) * distance / steps;
    z += Math.sin(tangent) * distance / steps;
  }
  return { x, y: (v - 0.5) * PAGE_HEIGHT, z, angle: tangent };
}

export function releaseShouldCommit(progress: number, velocity: number): boolean {
  return progress > 0.36 || (progress > 0.055 && velocity > 0.45);
}
