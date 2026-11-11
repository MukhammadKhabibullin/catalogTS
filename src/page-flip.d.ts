declare module 'page-flip/dist/js/page-flip.module.js' {
  export interface FlipSettings {
    width: number;
    height: number;
    size: 'fixed' | 'stretch';
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    showCover: boolean;
    usePortrait: boolean;
    drawShadow: boolean;
    flippingTime: number;
    maxShadowOpacity: number;
    mobileScrollSupport: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    clickEventForward: boolean;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
    startPage: number;
    autoSize: boolean;
  }
  export class PageFlip {
    constructor(element: HTMLElement, settings: Partial<FlipSettings>);
    on(event: 'flip' | 'changeOrientation' | 'init' | 'changeState', callback: (event: { data: number | string; object: PageFlip }) => void): void;
    loadFromHTML(pages: HTMLElement[]): void;
    updateFromHtml(pages: HTMLElement[]): void;
    getCurrentPageIndex(): number;
    getOrientation(): 'portrait' | 'landscape';
    getSettings(): FlipSettings;
    flipNext(corner?: 'top' | 'bottom'): void;
    flipPrev(corner?: 'top' | 'bottom'): void;
    flip(page: number, corner?: 'top' | 'bottom'): void;
    turnToPage(page: number): void;
    update(): void;
    destroy(): void;
  }
}
