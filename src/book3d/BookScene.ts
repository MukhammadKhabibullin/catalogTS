import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Fabric } from '../types';
import { createHoleMask, createSheetGeometry, deformSheet } from './geometry';
import { BookTextures, createEdgeTexture } from './textures';
import { adjacentPage, BASE_HEIGHT, BINDING_POSITIONS, BOARD_THICKNESS, clamp, normalizePage, pageCount, PAGE_HEIGHT, PAGE_WIDTH, releaseShouldCommit, RING_CENTER_Z, RING_RADIUS, SHEET_THICKNESS, sheetPoint, spreadFor, stackHeights } from './model';
import type { SheetPose } from './model';
import { CAMERA_BACK, CAMERA_TARGET_Y, CAMERA_TARGET_Z, CAMERA_UP, cameraDistanceForFrame, createBookTrajectoryFrame } from './framing';

export type LabelSlot = 'left' | 'right' | 'turnFront' | 'turnBack';
export type LabelPages = Record<LabelSlot, number | null>;

interface SceneOptions {
  host: HTMLElement;
  labels: Record<LabelSlot, HTMLElement>;
  fabrics: Fabric[];
  cover: string;
  reduceMotion: boolean;
  initialPage: number;
  onPageChange: (page: number, portrait: boolean) => void;
  onLabels: (pages: LabelPages) => void;
  onBusy: (busy: boolean) => void;
  onUnavailable: (reason: string) => void;
}

interface Sheet {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial, THREE.MeshStandardMaterial]>;
  lastPose?: string;
}

interface Transition {
  from: number;
  to: number;
  direction: -1 | 1;
  progress: number;
  corner: number;
  dragging: boolean;
  pendingCommit?: boolean;
  settle?: { from: number; to: number; started: number; duration: number };
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  time: number;
  velocity: number;
  direction: -1 | 1;
  canDrag: boolean;
  moved: boolean;
}

export class BookScene {
  readonly ready: Promise<void>;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cssRenderer = new CSS3DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly labelScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(18, 1, 0.05, 80);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly textures: BookTextures;
  private readonly holeFront = createHoleMask(false);
  private readonly holeBack = createHoleMask(true);
  private readonly edgeTexture = createEdgeTexture();
  private readonly contactTexture = this.createContactTexture();
  private readonly left: Sheet;
  private readonly right: Sheet;
  private readonly turn: Sheet;
  private readonly leftStack: THREE.Group;
  private readonly rightStack: THREE.Group;
  private readonly leftContact: THREE.Mesh;
  private readonly rightContact: THREE.Mesh;
  private readonly rings = new THREE.Group();
  private readonly studs = new THREE.Group();
  private readonly labelObjects: Record<LabelSlot, CSS3DObject>;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly labelAxisX = new THREE.Vector3();
  private readonly labelAxisY = new THREE.Vector3(0, 1, 0);
  private readonly labelNormal = new THREE.Vector3();
  private readonly labelMatrix = new THREE.Matrix4();
  private readonly resizeObserver: ResizeObserver;
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly shadow: THREE.DirectionalLight;
  private fabrics: Fabric[];
  private coverImage: string;
  private reduceMotion: boolean;
  private total: number;
  private page: number;
  private portrait: boolean;
  private width = 1;
  private height = 1;
  private pagePixels = 400;
  private cameraDistance = 8;
  private cameraVerticalOffset = 0;
  private lastCameraX = Number.NaN;
  private readonly framePoints = createBookTrajectoryFrame();
  private verticalOffsetPixels = 40;
  private transition: Transition | null = null;
  private drag: Drag | null = null;
  private queuedPage: number | null = null;
  private loadingTarget: number | null = null;
  private requestVersion = 0;
  private refreshVersion = 0;
  private frame: number | null = null;
  private disposed = false;
  private activeKeys: string[] = [];

  constructor(private options: SceneOptions) {
    this.fabrics = options.fabrics;
    this.coverImage = options.cover;
    this.reduceMotion = options.reduceMotion;
    this.total = pageCount(this.fabrics.length);
    this.portrait = options.host.clientWidth < 760;
    this.page = normalizePage(options.initialPage, this.total, this.portrait);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'book3d-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'img');
    this.cssRenderer.domElement.className = 'book3d-label-layer';
    options.host.append(this.renderer.domElement, this.cssRenderer.domElement);
    this.textures = new BookTextures(1024, 8, Math.min(4, this.renderer.capabilities.getMaxAnisotropy()));
    this.environment = this.createEnvironment();
    this.scene.environment = this.environment.texture;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x77746c, 1.8));
    this.shadow = new THREE.DirectionalLight(0xffffff, 2.2);
    this.shadow.position.set(-3, 4, 7);
    this.shadow.castShadow = true;
    Object.assign(this.shadow.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 0.1, far: 16 });
    this.shadow.shadow.bias = -0.00015;
    this.shadow.shadow.normalBias = 0.006;
    this.shadow.shadow.radius = 3;
    this.shadow.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.shadow);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.2 }));
    floor.position.z = -0.004; floor.receiveShadow = true; this.scene.add(floor);
    this.leftStack = this.createStack(-1);
    this.rightStack = this.createStack(1);
    const contactMaterial = new THREE.MeshBasicMaterial({ map: this.contactTexture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 });
    this.leftContact = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_WIDTH + 0.45, PAGE_HEIGHT + 0.45), contactMaterial);
    this.rightContact = this.leftContact.clone();
    this.leftContact.position.set(-PAGE_WIDTH / 2 - 0.025, -0.045, 0.001);
    this.rightContact.position.set(PAGE_WIDTH / 2 + 0.025, -0.045, 0.001);
    this.scene.add(this.leftContact, this.rightContact);
    this.left = this.createSheet(); this.right = this.createSheet(); this.turn = this.createSheet();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb5b7ad, metalness: 0.96, roughness: 0.2, envMapIntensity: 1.1 });
    for (const y of BINDING_POSITIONS) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 0.013, 10, 48), metal);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, y, RING_CENTER_Z);
      ring.castShadow = true; ring.receiveShadow = true; this.rings.add(ring);
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.029, 16, 10), metal);
      stud.scale.z = 0.36; stud.userData.bindingY = y; stud.castShadow = true; this.studs.add(stud);
    }
    this.scene.add(this.rings, this.studs);
    this.labelObjects = Object.fromEntries(Object.entries(options.labels).map(([key, element]) => {
      const object = new CSS3DObject(element); this.labelScene.add(object); return [key, object];
    })) as Record<LabelSlot, CSS3DObject>;
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('lostpointercapture', this.pointerCancel);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(options.host);
    this.resize();
    this.ready = this.refresh();
  }

  private createEnvironment(): THREE.WebGLRenderTarget {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.4, '#c7c8c0'); gradient.addColorStop(0.57, '#52554f'); gradient.addColorStop(1, '#aaa99f');
    context.fillStyle = gradient; context.fillRect(0, 0, 512, 256);
    context.fillStyle = '#fff'; context.fillRect(50, 20, 55, 175); context.fillRect(350, 30, 100, 110);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(this.renderer);
    const target = generator.fromEquirectangular(texture);
    texture.dispose(); generator.dispose();
    return target;
  }

  private createContactTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.filter = 'blur(12px)';
    context.fillStyle = 'rgba(35, 30, 22, 0.45)';
    context.beginPath(); context.roundRect(26, 25, 204, 204, 5); context.fill();
    return new THREE.CanvasTexture(canvas);
  }

  private createSheet(): Sheet {
    const front = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: this.holeFront, alphaTest: 0.5, toneMapped: false });
    const back = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: this.holeBack, alphaTest: 0.5, toneMapped: false });
    const edge = new THREE.MeshStandardMaterial({ color: 0xbeb7a8, roughness: 0.94 });
    const materials: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial, THREE.MeshStandardMaterial] = [front, back, edge];
    const mesh = new THREE.Mesh(createSheetGeometry(), materials);
    mesh.castShadow = true;
    const shade = new THREE.Mesh(mesh.geometry, new THREE.ShadowMaterial({ color: 0x17160f, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    shade.receiveShadow = true;
    const group = new THREE.Group(); group.add(mesh, shade); this.scene.add(group);
    return { group, mesh };
  }

  private createStack(side: -1 | 1): THREE.Group {
    const group = new THREE.Group();
    const board = new THREE.Mesh(new RoundedBoxGeometry(PAGE_WIDTH + 0.035, PAGE_HEIGHT + 0.035, BOARD_THICKNESS, 2, 0.012), new THREE.MeshStandardMaterial({ color: 0x282c28, roughness: 0.78 }));
    board.position.z = BOARD_THICKNESS / 2; board.castShadow = true; board.receiveShadow = true;
    const geometry = new THREE.BoxGeometry(PAGE_WIDTH, PAGE_HEIGHT, 1);
    const positions = geometry.getAttribute('position'); const uv = geometry.getAttribute('uv');
    for (let index = 0; index < 16; index++) uv.setXY(index, (index < 8 ? positions.getY(index) / PAGE_HEIGHT : positions.getX(index) / PAGE_WIDTH) + 0.5, positions.getZ(index) + 0.5);
    const paper = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.edgeTexture, roughness: 1, color: 0xe9e4d9 }));
    paper.castShadow = true; paper.receiveShadow = true;
    group.add(board, paper);
    group.position.set(side * (PAGE_WIDTH / 2 + 0.025), 0, BASE_HEIGHT);
    this.scene.add(group);
    return group;
  }

  private key(page: number | null): string {
    if (page === 0) return this.coverImage || 'cover';
    if (page === this.total - 1) return 'back';
    return page !== null && this.fabrics[page - 1] ? this.fabrics[page - 1].image : 'inside';
  }

  private pages(): LabelPages {
    const from = spreadFor(this.page, this.total, this.portrait);
    const transition = this.transition;
    if (!transition) return { ...from, turnFront: null, turnBack: null };
    const to = spreadFor(transition.to, this.total, this.portrait);
    return transition.direction > 0
      ? { left: from.left, right: to.right, turnFront: from.right, turnBack: this.portrait ? to.right : to.left }
      : { left: to.left, right: from.right, turnFront: to.right, turnBack: this.portrait ? from.right : from.left };
  }

  private async refresh(): Promise<void> {
    const version = ++this.refreshVersion;
    const pages = this.pages();
    const keys = Object.values(pages).filter((page): page is number => page !== null).map((page) => this.key(page));
    this.textures.protect([...this.activeKeys, ...keys]);
    let loaded: (readonly [string, THREE.Texture])[];
    try { loaded = await Promise.all([...new Set([...keys, 'inside'])].map(async (key) => [key, await this.textures.get(key)] as const)); }
    catch (error) { if (this.disposed || version !== this.refreshVersion) return; throw error; }
    if (this.disposed || version !== this.refreshVersion) return;
    const textures = new Map(loaded);
    const set = (sheet: Sheet, front: number | null, back: number | null) => {
      sheet.mesh.material[0].map = textures.get(this.key(front)) ?? textures.get('inside')!;
      sheet.mesh.material[1].map = textures.get(this.key(back)) ?? textures.get('inside')!;
      sheet.mesh.material[0].needsUpdate = sheet.mesh.material[1].needsUpdate = true;
    };
    set(this.left, pages.left, pages.left); set(this.right, pages.right, pages.right); set(this.turn, pages.turnFront, pages.turnBack);
    this.activeKeys = keys;
    this.textures.protect(keys);
    this.options.onLabels(pages);
    this.report(); this.requestFrame();
    const nearby = [this.page - 2, this.page - 1, this.page + 1, this.page + 2, this.page + 3].filter((page) => page >= 0 && page < this.total);
    for (const page of nearby.slice(0, 3)) void this.textures.get(this.key(page)).catch(() => undefined);
  }

  private report() {
    this.options.onPageChange(this.page, this.portrait);
    const spread = spreadFor(this.page, this.total, this.portrait);
    const names = [spread.left, spread.right].flatMap((page) => page !== null && this.fabrics[page - 1] ? [this.fabrics[page - 1].name] : []);
    this.renderer.domElement.setAttribute('aria-label', `Трехмерная книга образцов тканей. ${this.page === 0 ? 'Обложка' : this.page === this.total - 1 ? 'Задняя обложка' : names.join(', ')}. Для перелистывания используйте стрелки.`);
    this.options.host.dataset.page = String(this.page);
  }

  next() { void this.navigate(adjacentPage(this.queuedPage ?? this.loadingTarget ?? this.transition?.to ?? this.page, 1, this.total, this.portrait)); }
  previous() { void this.navigate(adjacentPage(this.queuedPage ?? this.loadingTarget ?? this.transition?.to ?? this.page, -1, this.total, this.portrait)); }
  cover() { void this.navigate(0); }
  goToFabric(index: number) { void this.navigate(clamp(index, 0, this.fabrics.length - 1) + 1); }

  async setCatalog(fabrics: Fabric[], cover: string, revisionChanged: boolean) {
    await this.ready;
    if (this.disposed) return;
    if (this.fabrics === fabrics && this.coverImage === cover && !revisionChanged) return;
    this.requestVersion++;
    this.transition = null; this.drag = null; this.queuedPage = null; this.loadingTarget = null;
    this.fabrics = fabrics; this.coverImage = cover; this.total = pageCount(fabrics.length);
    this.page = revisionChanged ? 0 : normalizePage(this.page, this.total, this.portrait);
    try { await this.refresh(); } catch { this.fail('Не удалось загрузить материалы книги.'); }
  }

  setReduceMotion(reduceMotion: boolean) {
    this.reduceMotion = reduceMotion;
    if (reduceMotion && this.transition?.settle) this.finish(this.transition.settle.to === 1);
    this.requestFrame();
  }

  invalidate() { this.requestFrame(); }

  private async navigate(target: number, dragging = false, corner = 0) {
    await this.ready;
    if (this.disposed) return;
    const to = normalizePage(target, this.total, this.portrait);
    if (this.transition || this.loadingTarget !== null) { if (!dragging) this.queuedPage = to; return; }
    if (to === this.page) return;
    const version = ++this.requestVersion;
    this.loadingTarget = to;
    this.options.onBusy(true);
    const transition: Transition = { from: this.page, to, direction: to > this.page ? 1 : -1, progress: 0, corner, dragging };
    this.transition = transition;
    try {
      await this.refresh();
      if (this.disposed || version !== this.requestVersion) return;
      this.loadingTarget = null; this.options.onBusy(false);
      if (transition.pendingCommit !== undefined) this.settle(transition.pendingCommit);
      else if (dragging && this.drag) {
        const progress = clamp((this.drag.startX - this.drag.lastX) * transition.direction / (this.pagePixels * 0.92), 0, 1);
        transition.progress = progress;
      } else { this.settle(!dragging); }
      this.requestFrame();
    } catch {
      if (version === this.requestVersion && !this.disposed) this.fail('Не удалось загрузить страницу каталога.');
    }
  }

  private settle(commit: boolean) {
    const transition = this.transition;
    if (!transition) return;
    transition.dragging = false;
    if (this.reduceMotion) { this.finish(commit); return; }
    transition.settle = { from: transition.progress, to: commit ? 1 : 0, started: performance.now(), duration: Math.max(180, Math.abs((commit ? 1 : 0) - transition.progress) * 900) };
    this.requestFrame();
  }

  private finish(commit: boolean) {
    if (!this.transition) return;
    const transition = this.transition;
    const copyFace = (sheet: Sheet, texture: THREE.Texture | null) => {
      sheet.mesh.material[0].map = sheet.mesh.material[1].map = texture;
    };
    if (commit) {
      if (transition.direction > 0) copyFace(this.left, this.turn.mesh.material[1].map);
      else copyFace(this.right, this.turn.mesh.material[0].map);
    } else {
      if (transition.direction > 0) copyFace(this.right, this.turn.mesh.material[0].map);
      else copyFace(this.left, this.turn.mesh.material[1].map);
    }
    this.page = commit ? transition.to : transition.from;
    this.transition = null;
    this.options.onBusy(false);
    void this.refresh().then(() => {
      if (this.queuedPage !== null && !this.disposed) {
        const target = this.queuedPage; this.queuedPage = null; void this.navigate(target);
      }
    }).catch(() => { if (!this.disposed) this.fail('Не удалось загрузить страницу каталога.'); });
  }

  private fail(reason: string) {
    this.options.onBusy(false);
    this.options.onUnavailable(reason);
  }

  private resize = () => {
    if (this.disposed) return;
    const rect = this.options.host.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    const portrait = this.width < 760;
    if (portrait !== this.portrait) {
      this.requestVersion++;
      const committed = this.transition?.settle?.to === 1 || this.transition?.pendingCommit === true;
      this.page = normalizePage(committed && this.transition ? this.transition.to : this.page, this.total, portrait);
      this.transition = null; this.drag = null; this.queuedPage = null; this.loadingTarget = null;
      this.portrait = portrait;
      this.options.onBusy(false);
      void this.refresh().catch(() => { if (!this.disposed) this.fail('Не удалось изменить размер книги.'); });
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.portrait ? 1.5 : 1.75);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.cssRenderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.verticalOffsetPixels = this.portrait
      ? clamp(this.height * 0.045, 18, 26)
      : clamp(this.height * 0.1, 35, 50);
    this.cameraDistance = cameraDistanceForFrame(this.framePoints, {
      aspect: this.camera.aspect,
      fovDegrees: this.camera.fov,
      viewportHeight: this.height,
      verticalOffsetPixels: this.verticalOffsetPixels,
      safeInsetPixels: this.portrait ? 10 : 12,
      horizontalHalfExtent: (PAGE_WIDTH * (this.portrait ? 1 : 2) + 0.55) / 2,
    });
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.cameraVerticalOffset = 2 * this.verticalOffsetPixels / this.height * this.cameraDistance * tangent;
    this.pagePixels = PAGE_WIDTH / (2 * this.cameraDistance * tangent) * this.height;
    this.options.host.style.setProperty('--book-label-max', `${Math.min(180, this.pagePixels * 0.58)}px`);
    this.camera.updateProjectionMatrix();
    this.lastCameraX = Number.NaN;
    this.requestFrame();
  };

  private updateStack(group: THREE.Group, height: number, topHard: boolean) {
    group.visible = height > 0.00001;
    if (!group.visible) return;
    const board = group.children[0] as THREE.Mesh;
    const paper = group.children[1] as THREE.Mesh;
    const boardHeight = Math.min(BOARD_THICKNESS, height);
    board.scale.z = boardHeight / BOARD_THICKNESS; board.position.z = boardHeight / 2;
    const paperHeight = Math.max(0, height - boardHeight - (topHard ? BOARD_THICKNESS : 0));
    paper.visible = paperHeight > 0.00001;
    paper.scale.z = Math.max(0.0001, paperHeight);
    paper.position.z = boardHeight + paperHeight / 2;
  }

  private isHard(page: number | null) { return page === 0 || page === this.total - 1; }

  private placeSheet(sheet: Sheet, page: number | null, side: -1 | 1, top: number): SheetPose {
    const thickness = this.isHard(page) ? BOARD_THICKNESS : SHEET_THICKNESS;
    const pose: SheetPose = { progress: side < 0 ? 1 : 0, startZ: top - thickness / 2, endZ: top - thickness / 2, rigid: true, corner: 0 };
    sheet.group.visible = page !== null;
    const signature = `${side}:${top}:${thickness}`;
    if (page !== null && sheet.lastPose !== signature) {
      sheet.mesh.material[2].color.set(this.isHard(page) ? 0x262a25 : 0xcac3b4);
      deformSheet(sheet.mesh.geometry, pose, thickness);
      sheet.lastPose = signature;
    }
    return pose;
  }

  private placeLabel(slot: LabelSlot, page: number | null, pose: SheetPose, back: boolean, visible: boolean) {
    const object = this.labelObjects[slot];
    const hasFabric = page !== null && !!this.fabrics[page - 1];
    object.visible = visible && hasFabric;
    object.element.style.pointerEvents = object.visible ? 'auto' : 'none';
    if (!object.visible) return;
    const unitsPerPixel = PAGE_WIDTH / this.pagePixels;
    const width = Math.min(190, object.element.offsetWidth || 130) * unitsPerPixel;
    const height = (object.element.offsetHeight || 35) * unitsPerPixel;
    const margin = Math.max(0.085, 12 * unitsPerPixel);
    const u = clamp(1 - (width / 2 + margin) / PAGE_WIDTH, 0.42, 0.96);
    const v = clamp((height / 2 + margin) / PAGE_HEIGHT, 0.03, 0.3);
    const point = sheetPoint(u, v, pose);
    const sign = back ? -1 : 1;
    this.labelAxisX.set(Math.cos(point.angle) * sign, 0, Math.sin(point.angle) * sign);
    this.labelNormal.crossVectors(this.labelAxisX, this.labelAxisY);
    object.position.set(point.x + this.labelNormal.x * 0.006, point.y, point.z + this.labelNormal.z * 0.006);
    this.labelMatrix.makeBasis(this.labelAxisX, this.labelAxisY, this.labelNormal);
    object.quaternion.setFromRotationMatrix(this.labelMatrix);
    object.scale.setScalar(unitsPerPixel);
  }

  private draw = (now: number) => {
    this.frame = null;
    if (this.disposed) return;
    let transition = this.transition;
    if (transition?.settle) {
      const amount = clamp((now - transition.settle.started) / transition.settle.duration, 0, 1);
      const eased = amount < 0.5 ? 4 * amount ** 3 : 1 - (-2 * amount + 2) ** 3 / 2;
      transition.progress = transition.settle.from + (transition.settle.to - transition.settle.from) * eased;
      if (amount >= 1) { this.finish(transition.settle.to === 1); transition = null; }
    }
    const pages = this.pages();
    const fromHeights = stackHeights(this.page, this.total, this.portrait);
    const toHeights = transition ? stackHeights(transition.to, this.total, this.portrait) : fromHeights;
    const leftHeight = transition ? Math.min(fromHeights.left, toHeights.left) : fromHeights.left;
    const rightHeight = transition ? Math.min(fromHeights.right, toHeights.right) : fromHeights.right;
    this.updateStack(this.leftStack, leftHeight, this.isHard(pages.left));
    this.updateStack(this.rightStack, rightHeight, this.isHard(pages.right));
    if (this.portrait) this.leftStack.visible = false;
    this.leftContact.visible = !this.portrait && (this.leftStack.visible || !!transition);
    this.rightContact.visible = this.rightStack.visible || !!transition;
    const leftPose = this.placeSheet(this.left, pages.left, -1, BASE_HEIGHT + leftHeight + 0.0008);
    const rightPose = this.placeSheet(this.right, pages.right, 1, BASE_HEIGHT + rightHeight + 0.0008);
    this.turn.group.visible = !!transition;
    const progress = transition?.progress ?? 0;
    let turningPose: SheetPose | null = null;
    let turningThickness = SHEET_THICKNESS;
    if (transition) {
      turningThickness = Math.max(SHEET_THICKNESS, Math.abs(toHeights.left - fromHeights.left));
      turningPose = {
        progress: transition.direction > 0 ? progress : 1 - progress,
        startZ: BASE_HEIGHT + (transition.direction > 0 ? fromHeights.right : toHeights.right) - turningThickness / 2 + 0.002,
        endZ: BASE_HEIGHT + (transition.direction > 0 ? toHeights.left : fromHeights.left) - turningThickness / 2 + 0.002,
        rigid: this.isHard(pages.turnFront) || this.isHard(pages.turnBack), corner: transition.corner,
      };
      this.turn.mesh.material[2].color.set(turningPose.rigid ? 0x262a25 : 0xcac3b4);
      deformSheet(this.turn.mesh.geometry, turningPose, turningThickness);
    }
    this.rings.visible = transition ? (this.isHard(transition.from) ? progress > 0.1 : this.isHard(transition.to) ? progress < 0.9 : true) : !this.isHard(this.page);
    const frontPose = transition && (pages.turnFront === 0 || pages.turnBack === 0) ? turningPose : this.page === 0 ? rightPose : null;
    this.studs.visible = !!frontPose && !this.coverImage;
    if (frontPose) for (const stud of this.studs.children) {
      const point = sheetPoint(0.105 / PAGE_WIDTH, (stud.userData.bindingY as number) / PAGE_HEIGHT + 0.5, frontPose);
      const offset = (transition ? turningThickness : BOARD_THICKNESS) / 2 + 0.008;
      stud.position.set(point.x - Math.sin(point.angle) * offset, point.y, point.z + Math.cos(point.angle) * offset);
      stud.rotation.y = -point.angle;
    }
    const center = (page: number) => this.portrait ? PAGE_WIDTH / 2 : page === 0 ? PAGE_WIDTH / 2 : page === this.total - 1 ? -PAGE_WIDTH / 2 : 0;
    const cameraX = transition ? center(this.page) + (center(transition.to) - center(this.page)) * progress : center(this.page);
    if (cameraX !== this.lastCameraX) {
      this.cameraTarget.set(
        cameraX + CAMERA_UP.x * this.cameraVerticalOffset,
        CAMERA_TARGET_Y + CAMERA_UP.y * this.cameraVerticalOffset,
        CAMERA_TARGET_Z + CAMERA_UP.z * this.cameraVerticalOffset,
      );
      this.camera.position.set(
        this.cameraTarget.x + CAMERA_BACK.x * this.cameraDistance,
        this.cameraTarget.y + CAMERA_BACK.y * this.cameraDistance,
        this.cameraTarget.z + CAMERA_BACK.z * this.cameraDistance,
      );
      this.camera.lookAt(this.cameraTarget);
      this.camera.updateMatrixWorld();
      this.lastCameraX = cameraX;
    }
    this.placeLabel('left', pages.left, leftPose, true, !transition || (transition.direction > 0 ? progress < 0.55 : progress > 0.38));
    this.placeLabel('right', pages.right, rightPose, false, !transition || (transition.direction > 0 ? progress > 0.38 : progress < 0.55));
    if (turningPose) {
      const cosine = Math.cos(turningPose.progress * Math.PI);
      this.placeLabel('turnFront', pages.turnFront, turningPose, false, cosine > 0.02);
      this.placeLabel('turnBack', pages.turnBack, turningPose, true, cosine < -0.02);
    } else { this.labelObjects.turnFront.visible = this.labelObjects.turnBack.visible = false; }
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.labelScene, this.camera);
    if (this.transition?.settle) this.requestFrame();
  };

  private requestFrame() {
    if (!this.disposed && this.frame === null && !document.hidden) this.frame = requestAnimationFrame(this.draw);
  }

  private visibilityChange = () => {
    if (document.hidden && this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    else this.requestFrame();
  };

  private contextLost = (event: Event) => { event.preventDefault(); if (!this.disposed) this.fail('3D-режим недоступен. Открыт обычный каталог.'); };

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || this.transition || this.loadingTarget !== null) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([this.left.mesh, this.right.mesh].filter((mesh) => mesh.parent?.visible), false)[0];
    if (!hit) return;
    const direction = hit.object === this.left.mesh ? -1 : 1;
    const u = hit.uv ? (direction < 0 ? 1 - hit.uv.x : hit.uv.x) : 1;
    this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, time: performance.now(), velocity: 0, direction, canDrag: event.pointerType !== 'mouse' || u > 0.65 || Math.abs(hit.uv?.y ?? 0.5) > 0.78 || (hit.uv?.y ?? 0.5) < 0.22, moved: false };
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.focus({ preventScroll: true });
    event.preventDefault();
  };

  private pointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const now = performance.now();
    const dx = drag.startX - event.clientX;
    drag.velocity = (drag.lastX - event.clientX) * drag.direction / Math.max(1, now - drag.time);
    drag.lastX = event.clientX; drag.time = now;
    const dy = drag.startY - event.clientY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.canDrag || !drag.moved) return;
    if (!this.transition && this.loadingTarget === null) {
      if (Math.abs(dx) < Math.abs(dy) * 0.7) return;
      if (this.portrait) drag.direction = dx > 0 ? 1 : -1;
      if (dx * drag.direction <= 0) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      void this.navigate(adjacentPage(this.page, drag.direction, this.total, this.portrait), true, clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1));
    }
    if (this.transition?.dragging) {
      this.transition.progress = clamp(dx * this.transition.direction / (this.pagePixels * 0.92), 0, 1);
      if (this.loadingTarget === null) this.requestFrame();
    }
  };

  private pointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) return;
    this.drag = null;
    if (this.transition?.dragging) {
      const commit = releaseShouldCommit(this.transition.progress, performance.now() - drag.time < 100 ? drag.velocity : 0);
      if (this.loadingTarget !== null) this.transition.pendingCommit = commit;
      else this.settle(commit);
    }
    else if (!drag.moved) {
      if (this.page === 0) this.next();
      else if (this.page === this.total - 1) this.previous();
      else if (drag.direction > 0) this.next(); else this.previous();
    }
  };

  private pointerCancel = () => {
    this.drag = null;
    if (this.transition?.dragging) {
      if (this.loadingTarget !== null) this.transition.pendingCommit = false;
      else this.settle(false);
    }
  };

  dispose() {
    this.disposed = true; this.requestVersion++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('lostpointercapture', this.pointerCancel); canvas.removeEventListener('webglcontextlost', this.contextLost);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.textures.dispose(); this.holeFront.dispose(); this.holeBack.dispose(); this.edgeTexture.dispose(); this.contactTexture.dispose(); this.environment.dispose(); this.shadow.shadow.dispose();
    this.renderer.dispose();
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
    this.renderer.domElement.remove(); this.cssRenderer.domElement.remove();
    for (const object of Object.values(this.labelObjects)) object.removeFromParent();
  }
}
