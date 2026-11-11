import { useState } from 'react';
import type { Fabric } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function CollectionModal({ fabrics, onSelect, onClose }: { fabrics: Fabric[]; onSelect: (index: number) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const normalized = query.toLocaleLowerCase('ru').trim();
  const matches = fabrics.map((fabric, index) => ({ fabric, index })).filter(({ fabric }) => `${fabric.name} ${fabric.sku ?? ''}`.toLocaleLowerCase('ru').includes(normalized));
  return <Modal title="Содержание каталога" onClose={onClose} className="collection-modal">
    <label className="search-field"><Icon name="search" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или артикул ткани" aria-label="Найти ткань" /><span>{matches.length}</span></label>
    <div className="collection-list">{matches.length ? matches.map(({ fabric, index }) => <button key={fabric.id} className="collection-item" onClick={() => onSelect(index)}><span className="collection-number">{String(index + 1).padStart(3, '0')}</span><img src={fabric.thumbnail || fabric.image} alt="" loading="lazy" /><span>{fabric.name}</span><Icon name="right" size={16} /></button>) : <p className="empty-message">По этому запросу ткани не найдены.</p>}</div>
  </Modal>;
}
