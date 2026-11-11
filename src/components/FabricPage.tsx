import { Icon } from './Icon';
import type { Fabric } from '../types';

export function FabricPage({ fabric, index, loaded, onZoom }: { fabric: Fabric; index: number; loaded: boolean; onZoom: (fabric: Fabric) => void }) {
  return <div className={`fabric-face ${index % 2 === 0 ? 'fabric-face--left' : ''} ${fabric.source === 'pdf' ? 'fabric-face--pdf' : ''}`}>
    {loaded && <img src={fabric.image} alt={`Фактура ткани ${fabric.name}`} decoding="async" draggable="false" className="fabric-image" />}
    <div className="fabric-gutter" />
    <FabricCaption fabric={fabric} onZoom={onZoom} />
    <span className="fabric-page-number">{String(index + 1).padStart(3, '0')}</span>
  </div>;
}

export function FabricCaption({ fabric, onZoom }: { fabric: Fabric; onZoom: (fabric: Fabric) => void }) {
  return <div className="fabric-caption"><div className="fabric-caption-text"><span className="fabric-caption-kicker">ТИХИЕ СТЕНЫ</span><h2 title={fabric.name}>{fabric.name}</h2></div><button onClick={(event) => { event.stopPropagation(); onZoom(fabric); }} aria-label={`Увеличить ${fabric.name}`} title={`Увеличить ${fabric.name}`} className="fabric-zoom"><Icon name="plus" size={13} /></button></div>;
}
