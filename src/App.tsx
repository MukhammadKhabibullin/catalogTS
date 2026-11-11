import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import baseFabrics from './data/fabrics.json';
import type { CatalogSettings, CatalogSnapshot, Fabric } from './types';
import { Header } from './components/Header';
import { CatalogBook } from './components/CatalogBook';
import type { BookHandle } from './components/CatalogBook';
import { Icon } from './components/Icon';
import { ContactsModal } from './components/ContactsModal';
import { CollectionModal } from './components/CollectionModal';
import { ZoomModal } from './components/ZoomModal';
import { loadSnapshot, saveSnapshot } from './lib/storage';
import { useAssetUrls } from './hooks/useAssetUrls';

const CatalogManager = lazy(() => import('./components/CatalogManager').then((module) => ({ default: module.CatalogManager })));
const defaultSettings: CatalogSettings = { cover: '', logo: '', contacts: { phone: '', email: '', address: '' } };

export default function App() {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>({ fabrics: baseFabrics as Fabric[], settings: defaultSettings, assets: [] });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const [bookVersion, setBookVersion] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [dialog, setDialog] = useState<'contacts' | 'collection' | 'manager' | null>(null);
  const [managerTab, setManagerTab] = useState<'fabrics' | 'contacts'>('fabrics');
  const [zoom, setZoom] = useState<Fabric | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const bookRef = useRef<BookHandle>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const resolve = useAssetUrls(snapshot.assets);
  const fabrics = useMemo(() => snapshot.fabrics.map((fabric) => ({ ...fabric, image: resolve(fabric.image), original: resolve(fabric.original), thumbnail: fabric.thumbnail ? resolve(fabric.thumbnail) : undefined })), [snapshot.fabrics, resolve]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const [saved, settings] = await Promise.allSettled([
        loadSnapshot(),
        fetch('/catalog/settings.json').then(async (response) => { if (!response.ok) throw new Error('Настройки каталога недоступны.'); return await response.json() as CatalogSettings; }),
      ]);
      if (!active) return;
      if (saved.status === 'fulfilled' && saved.value) setSnapshot(saved.value);
      else if (settings.status === 'fulfilled') setSnapshot((old) => ({ ...old, settings: { ...defaultSettings, ...settings.value, contacts: { ...defaultSettings.contacts, ...settings.value.contacts } } }));
      if (saved.status === 'rejected') setNotice('Локальное хранилище недоступно. Сохраненные правки не загружены; показаны файлы проекта.');
      else if (settings.status === 'rejected') setNotice('Не удалось загрузить настройки проекта. Используются стандартные значения.');
      setReady(true);
    }
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduceMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (dialog || zoom || event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName))) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); bookRef.current?.next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); bookRef.current?.previous(); }
      if (event.key === 'Home') { event.preventDefault(); bookRef.current?.cover(); }
      if (event.key === 'Escape' && expanded && !document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dialog, zoom, expanded]);

  useEffect(() => {
    const handler = () => setExpanded(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (expanded) { setExpanded(false); return; }
    try { await document.documentElement.requestFullscreen(); }
    catch { setExpanded(true); }
  }

  const count = fabrics.length;
  const totalPages = count + (count % 2 === 1 ? 3 : 2);
  const closed = page === 0;
  const end = page >= totalPages - 1;
  const current = Math.min(count - 1, Math.max(0, page - 1));
  const firstNumber = String(current + 1).padStart(3, '0');
  const secondNumber = String(Math.min(count, current + (portrait ? 1 : 2))).padStart(3, '0');

  return <div className={`app ${expanded ? 'app--expanded' : ''}`}>
    <Header logo={resolve(snapshot.settings.logo)} onCatalog={() => { setDialog(null); setZoom(null); bookRef.current?.cover(); }} onContacts={() => setDialog('contacts')} />
    <main className="catalog-workspace" ref={workspaceRef}>
      {notice && <div className="workspace-notice" role="status">{notice}<button aria-label="Скрыть уведомление" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
      <div className="book-area">
        {ready && count > 0 ? <CatalogBook revision={bookVersion} ref={bookRef} fabrics={fabrics} cover={resolve(snapshot.settings.cover)} reduceMotion={reduceMotion} onPageChange={(next, isPortrait) => { setPage(next); setPortrait(isPortrait); }} onZoom={setZoom} /> : <div className="catalog-loading">{ready ? 'Добавьте материалы через управление каталогом' : <><span className="spinner" />Подготовка каталога</>}</div>}
        <div className="book-instruction" aria-live="polite">{closed ? <><span className="instruction-line" />Нажмите на обложку, чтобы открыть<span className="instruction-line" /></> : end ? 'Конец каталога · вернуться можно стрелкой влево' : <><span className="desktop-hint">Потяните за угол страницы или используйте стрелки</span><span className="mobile-hint">Листайте свайпом влево или вправо</span></>}</div>
      </div>
      <div className="catalog-toolbar">
        <button className="toolbar-collection" onClick={() => setDialog('collection')} disabled={!count}><Icon name="list" size={19} /><span>СОДЕРЖАНИЕ</span><span className="toolbar-count">{count}</span></button>
        <div className="pagination"><button className="page-arrow" aria-label="Предыдущая страница" disabled={closed || !ready || !count} onClick={() => bookRef.current?.previous()}><Icon name="left" size={19} /></button><div className="page-indicator" aria-live="polite"><span>{closed ? 'ОБЛОЖКА' : end ? 'КОНЕЦ' : `${firstNumber}${!portrait && firstNumber !== secondNumber ? ` — ${secondNumber}` : ''}`}</span><span className="page-indicator-divider" /><span className="page-total">{String(count).padStart(3, '0')}</span></div><button className="page-arrow" aria-label={closed ? 'Открыть каталог' : 'Следующая страница'} disabled={end || !ready || !count} onClick={() => bookRef.current?.next()}><Icon name="right" size={19} /></button></div>
        <div className="toolbar-tools"><button className="icon-button" aria-label="Увеличить текущую ткань" title="Рассмотреть фактуру" disabled={closed || end || !count} onClick={() => setZoom(fabrics[current])}><Icon name="search" size={19} /></button><button className="icon-button" aria-label={expanded ? 'Выйти из полноэкранного режима' : 'Полноэкранный просмотр'} title="Полноэкранный просмотр" onClick={() => void toggleFullscreen()}><Icon name={expanded ? 'collapse' : 'expand'} size={19} /></button><span className="tool-separator" /><button className="icon-button" aria-label="Управление каталогом" title="Импорт файлов и настройки" disabled={!ready} onClick={() => { setManagerTab('fabrics'); setDialog('manager'); }}><Icon name="settings" size={19} /></button></div>
      </div>
      <footer className="workspace-footer"><span>ТИХИЕ СТЕНЫ <span className="footer-dot">·</span> АРХИТЕКТУРА СТИЛЯ</span><span>{!snapshot.settings.cover ? <span title="Фото оригинальной обложки еще не предоставлено. Загрузите его в настройках.">ВРЕМЕННАЯ ОБЛОЖКА</span> : 'ЦИФРОВОЙ КАТАЛОГ'}</span></footer>
    </main>
    {dialog === 'contacts' && <ContactsModal contacts={snapshot.settings.contacts} onClose={() => setDialog(null)} onEdit={() => { setManagerTab('contacts'); setDialog('manager'); }} />}
    {dialog === 'collection' && <CollectionModal fabrics={fabrics} onClose={() => setDialog(null)} onSelect={(index) => { setDialog(null); bookRef.current?.goToFabric(index); }} />}
    {dialog === 'manager' && <Suspense fallback={<div className="loading-overlay"><span className="spinner" />Загрузка редактора…</div>}><CatalogManager snapshot={snapshot} initialTab={managerTab} onClose={() => setDialog(null)} onSave={async (draft) => { await saveSnapshot(draft); setPage(0); setBookVersion((value) => value + 1); setSnapshot(draft); }} /></Suspense>}
    {zoom && <ZoomModal fabric={zoom} onClose={() => setZoom(null)} />}
  </div>;
}
