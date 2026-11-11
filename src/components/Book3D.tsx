import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookProps } from './bookTypes';
import type { BookScene, LabelPages, LabelSlot } from '../book3d/BookScene';
import { FabricCaption } from './FabricPage';

export function Book3D({ onUnavailable, ...props }: BookProps & { onUnavailable: (reason: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<BookScene | null>(null);
  const latest = useRef({ ...props, onUnavailable });
  latest.current = { ...props, onUnavailable };
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<LabelPages>({ left: null, right: null, turnFront: null, turnBack: null });
  const pendingCommand = useRef<(() => void) | null>(null);
  const elements = useMemo(() => Object.fromEntries((['left', 'right', 'turnFront', 'turnBack'] as LabelSlot[]).map((slot) => {
    const element = document.createElement('div'); element.className = 'book3d-caption-anchor';
    return [slot, element];
  })) as Record<LabelSlot, HTMLDivElement>, []);

  useEffect(() => {
    let active = true;
    let instance: BookScene | null = null;
    void import('../book3d/BookScene').then(async ({ BookScene }) => {
      if (!active || !host.current) return;
      const current = latest.current;
      instance = new BookScene({
        host: host.current, labels: elements, fabrics: current.fabrics, cover: current.cover,
        reduceMotion: current.reduceMotion, initialPage: current.initialPage ?? 0,
        onPageChange: (page, portrait) => { if (active) latest.current.onPageChange(page, portrait); },
        onLabels: (labels) => { if (active) setPages(labels); },
        onBusy: (value) => { if (active) setBusy(value); },
        onUnavailable: (reason) => { if (active) latest.current.onUnavailable(reason); },
      });
      engine.current = instance;
      await instance.ready;
      if (active) {
        setLoading(false);
        pendingCommand.current?.(); pendingCommand.current = null;
      }
    }).catch(() => { if (active) latest.current.onUnavailable('3D-режим недоступен. Открыт обычный каталог.'); });
    return () => { active = false; pendingCommand.current = null; engine.current = null; instance?.dispose(); };
  }, [elements]);

  const previousRevision = useRef(props.revision);
  useEffect(() => {
    const changed = previousRevision.current !== props.revision;
    previousRevision.current = props.revision;
    void engine.current?.setCatalog(props.fabrics, props.cover, changed).catch(() => {
      latest.current.onUnavailable('Не удалось загрузить материалы книги. Открыт обычный каталог.');
    });
  }, [props.fabrics, props.cover, props.revision]);
  useEffect(() => { engine.current?.setReduceMotion(props.reduceMotion); }, [props.reduceMotion]);
  useLayoutEffect(() => { engine.current?.invalidate(); }, [pages]);

  useImperativeHandle(props.ref, () => {
    const run = (action: (scene: BookScene) => void) => {
      if (engine.current && !loading) action(engine.current);
      else pendingCommand.current = () => { if (engine.current) action(engine.current); };
    };
    return { next: () => run((scene) => scene.next()), previous: () => run((scene) => scene.previous()), cover: () => run((scene) => scene.cover()), goToFabric: (index) => run((scene) => scene.goToFabric(index)) };
  }, [loading]);

  return <div className="book3d-stage" ref={host} id="catalog" data-renderer="three">
    {(loading || busy) && <div className={`book3d-loading ${loading ? 'book3d-loading--initial' : ''}`} role="status"><span className="spinner" />{loading ? 'Подготовка 3D-книги' : 'Подготовка страницы'}</div>}
    {Object.entries(pages).map(([slot, page]) => {
      const fabric = page !== null ? props.fabrics[page - 1] : null;
      return createPortal(fabric ? <FabricCaption fabric={fabric} onZoom={props.onZoom} /> : null, elements[slot as LabelSlot], slot);
    })}
  </div>;
}
