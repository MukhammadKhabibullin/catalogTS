import { useRef, useState } from 'react';
import type { Fabric } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function ZoomModal({ fabric, onClose }: { fabric: Fabric; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  return <Modal title={fabric.name} onClose={onClose} className="zoom-modal">
    <div className="zoom-viewport" ref={viewport}
      onPointerDown={(event) => { if (event.pointerType !== 'mouse' || scale === 1) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; }}
      onPointerMove={(event) => { if (!drag.current) return; event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX; event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY; }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => setScale((value) => value === 1 ? 2 : 1)}>
      <img src={failed ? fabric.image : fabric.original} alt={`Увеличенная фактура ткани ${fabric.name}`} draggable="false" style={{ width: `${scale * 100}%` }} onError={() => setFailed(true)} />
    </div>
    <div className="zoom-controls"><span className="zoom-hint">{failed ? 'Оригинал недоступен · показана версия для каталога' : fabric.source === 'pdf' ? 'Страница PDF · растровая копия' : 'Оригинальное изображение'}</span><div className="zoom-actions"><button className="icon-button" aria-label="Уменьшить" disabled={scale <= 1} onClick={() => setScale((value) => Math.max(1, value - 0.5))}><Icon name="minus" /></button><button className="zoom-value" title="Сбросить масштаб" onClick={() => { setScale(1); viewport.current?.scrollTo(0, 0); }}>{Math.round(scale * 100)}%</button><button className="icon-button" aria-label="Увеличить" disabled={scale >= 4} onClick={() => setScale((value) => Math.min(4, value + 0.5))}><Icon name="plus" /></button></div></div>
  </Modal>;
}
