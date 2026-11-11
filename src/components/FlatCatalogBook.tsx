import { useEffect, useLayoutEffect, useMemo, useRef, useState, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import { BookCover } from './BookCover';
import { FabricPage } from './FabricPage';
import type { BookProps } from './bookTypes';

export function FlatCatalogBook({ ref, fabrics, cover, onPageChange, onZoom, reduceMotion, revision, initialPage = 0 }: BookProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const flipHostRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const callbacks = useRef({ onPageChange, onZoom });
  callbacks.current = { onPageChange, onZoom };
  const [geometry, setGeometry] = useState({ size: 450, portrait: false, verticalOffset: 40 });
  const [page, setPage] = useState(initialPage);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const currentRef = useRef(initialPage);
  const totalPages = fabrics.length + (fabrics.length % 2 === 1 ? 3 : 2);
  const nodes = useMemo(() => Array.from({ length: totalPages }, (_, index) => {
    const node = document.createElement('div');
    node.className = `book-page ${index === 0 || index === totalPages - 1 ? 'book-page--hard' : ''}`;
    node.dataset.density = index === 0 || index === totalPages - 1 ? 'hard' : 'soft';
    return node;
  }), [totalPages]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const portrait = width < 760;
      const verticalOffset = Math.round(portrait
        ? Math.max(18, Math.min(26, height * 0.045))
        : Math.max(35, Math.min(50, height * 0.1)));
      const size = Math.floor(Math.max(120, Math.min(height - verticalOffset * 2 - 30, portrait ? width - 48 : (width - 132) / 2, 640)));
      setGeometry((old) => old.size === size && old.portrait === portrait && old.verticalOffset === verticalOffset ? old : { size, portrait, verticalOffset });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = document.createElement('div');
    host.className = 'page-flip-host';
    flipHostRef.current?.append(host);
    const flip = new PageFlip(host, {
      width: geometry.size, height: geometry.size, size: 'fixed',
      minWidth: 120, maxWidth: 640, minHeight: 120, maxHeight: 640,
      showCover: true, usePortrait: geometry.portrait,
      drawShadow: !reduceMotion, flippingTime: reduceMotion ? 1 : 950,
      maxShadowOpacity: 0.3, mobileScrollSupport: false,
      useMouseEvents: true, swipeDistance: 28, clickEventForward: true,
      showPageCorners: !reduceMotion, disableFlipByClick: false,
      startPage: Math.min(currentRef.current, totalPages - 1), autoSize: false,
    });
    const report = () => {
      const nextPage = flip.getCurrentPageIndex();
      currentRef.current = nextPage;
      setPage(nextPage);
      setRequestedPage(null);
      callbacks.current.onPageChange(nextPage, flip.getOrientation() === 'portrait');
    };
    flip.on('flip', report);
    flip.on('changeOrientation', report);
    flip.on('init', report);
    flip.loadFromHTML(nodes);
    flipRef.current = flip;
    return () => { flipRef.current = null; flip.destroy(); };
  }, []);

  const renderedRevision = useRef(revision);
  useEffect(() => {
    if (renderedRevision.current === revision) return;
    const flip = flipRef.current;
    if (!flip) return;
    flip.turnToPage(0);
    flip.updateFromHtml(nodes);
    currentRef.current = 0;
    setPage(0);
    setRequestedPage(null);
    renderedRevision.current = revision;
  }, [revision, nodes]);

  useEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;
    const settings = flip.getSettings();
    settings.width = geometry.size;
    settings.height = geometry.size;
    settings.minWidth = geometry.size;
    settings.maxWidth = geometry.size;
    settings.minHeight = geometry.size;
    settings.maxHeight = geometry.size;
    settings.usePortrait = geometry.portrait;
    settings.flippingTime = reduceMotion ? 1 : 950;
    settings.drawShadow = !reduceMotion;
    settings.showPageCorners = !reduceMotion;
    const host = flipHostRef.current?.firstElementChild as HTMLElement | null;
    if (host) {
      host.style.minWidth = `${geometry.size * (geometry.portrait ? 1 : 2)}px`;
      host.style.minHeight = `${geometry.size}px`;
    }
    flip.update();
  }, [geometry, reduceMotion]);

  useImperativeHandle(ref, () => ({
    next: () => flipRef.current?.flipNext(),
    previous: () => flipRef.current?.flipPrev(),
    cover: () => flipRef.current?.flip(0),
    goToFabric: (index) => {
      const target = index + 1;
      setRequestedPage(target);
      const adjacent = fabrics.slice(Math.max(0, index - 1), index + 3);
      void Promise.all(adjacent.map((fabric) => {
        const image = new Image(); image.src = fabric.image;
        return image.decode().catch(() => undefined);
      })).then(() => flipRef.current?.flip(target));
    },
  }), [fabrics]);

  const isClosed = page === 0;
  const isBack = page === totalPages - 1;
  const shift = geometry.portrait ? 0 : isClosed ? -geometry.size / 2 : isBack ? geometry.size / 2 : 0;
  return <div className={`book-stage ${isClosed ? 'book-stage--closed' : ''} ${geometry.portrait ? 'book-stage--portrait' : ''}`} ref={stageRef} id="catalog">
    <div className="book-object" style={{ width: geometry.size * (geometry.portrait ? 1 : 2), height: geometry.size, transform: `translate(-50%, -50%) translate(${shift}px, ${geometry.verticalOffset}px)` }}>
      <div className="book-stack" style={{ left: geometry.portrait || isBack ? 0 : isClosed ? '50%' : 0, right: !geometry.portrait && isBack ? geometry.size - 4 : -4 }} />
      <div className="book-flip-surface" ref={flipHostRef} />
      {!isClosed && !isBack && <div className={`book-binding ${geometry.portrait ? 'book-binding--portrait' : ''}`} aria-hidden="true">{[0, 1, 2, 3].map((index) => <span key={index} className="binding-ring" />)}</div>}
    </div>
    {nodes.map((node, index) => createPortal(
      index === 0 ? <BookCover image={cover} /> :
      index === totalPages - 1 ? <BookCover image="" back /> :
      fabrics[index - 1] ? <FabricPage fabric={fabrics[index - 1]} index={index - 1} loaded={Math.abs(index - page) <= 4 || (requestedPage !== null && Math.abs(index - requestedPage) <= 3) || (page === 0 && index < 3)} onZoom={(fabric) => callbacks.current.onZoom(fabric)} /> :
      <div className="inside-back"><span>ТИХИЕ СТЕНЫ</span></div>, node, String(index),
    ))}
  </div>;
}
