import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CatalogSnapshot, Fabric, MatchResult } from '../types';
import { useAssetUrls } from '../hooks/useAssetUrls';
import { matchMetadata, moveFabric, validateMetadataMatches } from '../lib/catalog';
import { imagePreview, importImages, importPdf, readMetadata } from '../lib/importFiles';
import { Modal } from './Modal';
import { Icon } from './Icon';

type Tab = 'fabrics' | 'branding' | 'contacts';

export function CatalogManager({ snapshot, initialTab = 'fabrics', onSave, onClose }: {
  snapshot: CatalogSnapshot; initialTab?: Tab; onSave: (draft: CatalogSnapshot) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<CatalogSnapshot>(snapshot);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const filesRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const resolve = useAssetUrls(draft.assets);

  async function run(action: () => Promise<void>) {
    setError(''); setNotice(''); setBusy('Подготовка…');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось обработать файлы.'); }
    finally { setBusy(''); }
  }

  function changeFabric(id: string, values: Partial<Fabric>) {
    setDraft((old) => ({ ...old, fabrics: old.fabrics.map((fabric) => fabric.id === id ? { ...fabric, ...values } : fabric) }));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    await run(async () => {
      const result: Awaited<ReturnType<typeof importImages>> = { fabrics: [], assets: [] };
      for (const file of files) {
        const batch = /\.pdf$/i.test(file.name) ? await importPdf(file, setBusy) : await importImages([file], (message) => setBusy(`${result.fabrics.length + 1}/${files.length} · ${message}`));
        result.fabrics.push(...batch.fabrics); result.assets.push(...batch.assets);
      }
      setDraft((old) => ({ ...old, fabrics: mode === 'replace' ? result.fabrics : [...old.fabrics, ...result.fabrics], assets: [...old.assets, ...result.assets] }));
      setMatches(null);
      setNotice(`Подготовлено образцов: ${result.fabrics.length}. Проверьте названия и сохраните изменения.${result.fabrics.some((fabric) => fabric.source === 'pdf') ? ' Страницы PDF перенесены целиком; названия тканей нужно проверить.' : ''}`);
    });
  }

  async function handleExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await run(async () => {
      setBusy('Чтение Excel…');
      const rows = await readMetadata(file);
      if (!rows.length) throw new Error('В таблице нет заполненных названий.');
      const found = validateMetadataMatches(matchMetadata(draft.fabrics, rows));
      setMatches(found);
      setAssignments(Object.fromEntries(found.map((match, index) => [index, match.candidates.length === 1 && !match.conflict ? match.candidates[0] : ''])));
    });
  }

  async function handleBranding(event: ChangeEvent<HTMLInputElement>, key: 'cover' | 'logo') {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await run(async () => {
      if (file.size > 30 * 1024 * 1024) throw new Error('Изображение превышает 30 МБ.');
      const id = crypto.randomUUID();
      const preview = await imagePreview(file, 1600);
      setDraft((old) => ({ ...old, assets: [...old.assets, { id, preview, original: file }], settings: { ...old.settings, [key]: `asset:${id}:preview` } }));
    });
  }

  const chosen = Object.values(assignments).filter((value) => value && value !== '__skip');
  const hasDuplicates = new Set(chosen).size !== chosen.length;
  const readyToMatch = matches && matches.every((_, index) => !!assignments[index]) && !hasDuplicates;
  function applyMatches() {
    if (!matches || !readyToMatch) return;
    const byId = new Map(draft.fabrics.map((fabric) => [fabric.id, fabric]));
    const ordered: Fabric[] = [];
    matches.forEach((match, index) => {
      const id = assignments[index];
      const fabric = byId.get(id);
      if (fabric) { ordered.push({ ...fabric, name: match.row.name, sku: match.row.sku || fabric.sku, needsReview: false }); byId.delete(id); }
    });
    setDraft((old) => ({ ...old, fabrics: [...ordered, ...old.fabrics.filter((fabric) => byId.has(fabric.id))] }));
    setNotice(`Обновлено названий: ${ordered.length}. Порядок сопоставленных тканей взят из Excel. Остальные ткани размещены после них.`);
    setMatches(null);
  }

  async function save() {
    await run(async () => {
      if (!draft.fabrics.length) throw new Error('Добавьте хотя бы одну ткань.');
      if (draft.fabrics.some((fabric) => !fabric.name.trim())) throw new Error('Заполните названия всех тканей.');
      if (matches) throw new Error('Завершите или отмените сопоставление Excel.');
      const email = draft.settings.contacts.email.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Проверьте адрес электронной почты.');
      setBusy('Сохранение в браузере…');
      const refs = [draft.settings.cover, draft.settings.logo, ...draft.fabrics.flatMap((fabric) => [fabric.image, fabric.original, fabric.thumbnail ?? ''])];
      const used = new Set(refs.filter((value) => value.startsWith('asset:')).map((value) => value.split(':')[1]));
      await onSave({ ...draft, fabrics: draft.fabrics.map((fabric) => ({ ...fabric, name: fabric.name.trim() })), assets: draft.assets.filter((asset) => used.has(asset.id)) });
      onClose();
    });
  }

  const filtered = draft.fabrics.filter((fabric) => `${fabric.name} ${fabric.fileName} ${fabric.sku ?? ''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  return <Modal title="Управление каталогом" className="manager-modal" onClose={() => { if (!busy) onClose(); }}>
    <p className="manager-intro">Импорт и правки сохраняются в этом браузере. Для переноса на хостинг используйте папку проекта — инструкция в README.</p>
    <div className="manager-tabs" role="tablist" aria-label="Настройки каталога">{([['fabrics', 'Материалы'], ['branding', 'Обложка и логотип'], ['contacts', 'Контакты']] as const).map(([key, label]) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} disabled={!!busy} onClick={() => setTab(key)}>{label}</button>)}</div>
    {error && <div className="message message--error" role="alert">{error}</div>}
    {notice && <div className="message" role="status">{notice}</div>}
    {busy && <div className="import-progress" role="status"><span className="spinner" />{busy}</div>}
    <fieldset disabled={!!busy} className="manager-fieldset"><div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'fabrics' && <>
        <div className="import-toolbar"><button className="button button--dark" onClick={() => filesRef.current?.click()}><Icon name="upload" size={17} />Импорт файлов</button><button className="button button--light" onClick={() => excelRef.current?.click()}>Названия из Excel</button><span className="material-count">{draft.fabrics.length} образцов</span></div>
        <input type="file" ref={filesRef} multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFiles} hidden aria-label="Импорт изображений и PDF" />
        <input type="file" ref={excelRef} accept=".xlsx" onChange={handleExcel} hidden aria-label="Импорт таблицы Excel" />
        <div className="import-options"><label><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} name="import-mode" /> Добавить к текущим</label><label><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} name="import-mode" /> Заменить каталог</label></div>
        <p className="field-help">JPG, PNG, WebP или PDF · до 60 МБ на файл. Из Excel читаются столбцы «Название», «Артикул», «Файл» на первом листе.</p>
        {matches ? <div className="matching-panel"><h3>Проверьте сопоставление</h3><p className="field-help">Укажите ткань для каждой строки или выберите «Пропустить». Порядок строк Excel станет порядком сопоставленных тканей.</p>
          <div className="matching-list">{matches.map((match, index) => <label key={index} className={`match-row ${!assignments[index] ? 'match-row--review' : ''}`}><span><strong>{match.row.name}</strong><small>{match.row.sku || match.row.fileName || 'Без идентификатора'}{match.candidates.length !== 1 || match.conflict ? ' · требуется проверка' : ''}</small></span><select aria-label={`Ткань для ${match.row.name}`} value={assignments[index] || ''} onChange={(event) => setAssignments((old) => ({ ...old, [index]: event.target.value }))}><option value="">Выберите ткань…</option><option value="__skip">Пропустить</option>{draft.fabrics.map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name} — {fabric.fileName}</option>)}</select></label>)}</div>
          {hasDuplicates && <p className="inline-error">Одна ткань выбрана для нескольких строк. Проверьте сопоставление.</p>}
          <div className="matching-actions"><button className="button button--dark" disabled={!readyToMatch} onClick={applyMatches}>Применить названия и порядок</button><button className="text-button" onClick={() => setMatches(null)}>Отменить</button></div>
        </div> : <>
          <label className="search-field manager-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию или имени файла" aria-label="Поиск в редакторе" /></label>
          <div className="fabric-editor-list">{filtered.map((fabric) => { const index = draft.fabrics.indexOf(fabric); return <div key={fabric.id} className="fabric-editor-row"><span className="editor-number">{String(index + 1).padStart(3, '0')}</span><img src={resolve(fabric.thumbnail || fabric.image)} alt="" loading="lazy" /><div className="editor-name"><input aria-label={`Название ${fabric.fileName}`} value={fabric.name} onChange={(event) => changeFabric(fabric.id, { name: event.target.value, needsReview: false })} /><small title={fabric.fileName}>{fabric.needsReview ? 'Проверьте название · ' : ''}{fabric.fileName}</small></div><input className="editor-sku" placeholder="Артикул" aria-label={`Артикул ${fabric.fileName}`} value={fabric.sku || ''} onChange={(event) => changeFabric(fabric.id, { sku: event.target.value })} /><div className="reorder-buttons"><button className="icon-button" disabled={index === 0 || !!query} aria-label={`Переместить ${fabric.name} выше`} onClick={() => setDraft((old) => ({ ...old, fabrics: moveFabric(old.fabrics, fabric.id, -1) }))}><Icon name="up" size={15} /></button><button className="icon-button" disabled={index === draft.fabrics.length - 1 || !!query} aria-label={`Переместить ${fabric.name} ниже`} onClick={() => setDraft((old) => ({ ...old, fabrics: moveFabric(old.fabrics, fabric.id, 1) }))}><Icon name="down" size={15} /></button></div></div>; })}{!filtered.length && <p className="empty-message">Материалы не найдены.</p>}</div>
        </>}
      </>}
      {tab === 'branding' && <div className="branding-editor">{(['cover', 'logo'] as const).map((key) => <div className="branding-card" key={key}><div className={`branding-preview branding-preview--${key}`}>{draft.settings[key] ? <img src={resolve(draft.settings[key])} alt={key === 'cover' ? 'Текущая обложка' : 'Текущий логотип'} /> : <Icon name={key === 'cover' ? 'book' : 'image'} size={38} />}</div><div><h3>{key === 'cover' ? 'Оригинальная обложка' : 'Логотип компании'}</h3><p className="field-help">{key === 'cover' ? 'Квадратное фото лицевой стороны. До загрузки показывается временный макет, который не воспроизводит оригинал.' : 'Белый логотип на прозрачном фоне. До загрузки используется текстовая надпись.'}</p><label className="button button--light file-button"><Icon name="upload" size={16} />Загрузить изображение<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleBranding(event, key)} /></label></div></div>)}</div>}
      {tab === 'contacts' && <div className="contacts-editor"><p className="field-help">Пустые поля отображаются как «Пока не указан». Вымышленные данные не используются.</p>{([['phone', 'Телефон', 'tel'], ['email', 'Электронная почта', 'email'], ['address', 'Адрес', 'text']] as const).map(([key, label, type]) => <label className="form-field" key={key}><span>{label}</span><input type={type} value={draft.settings.contacts[key]} onChange={(event) => setDraft((old) => ({ ...old, settings: { ...old.settings, contacts: { ...old.settings.contacts, [key]: event.target.value } } }))} placeholder="Не указан" /></label>)}</div>}
    </div></fieldset>
    <div className="manager-footer"><span><Icon name="info" size={15} />Изменения вступят в силу после сохранения</span><div><button className="button button--light" disabled={!!busy} onClick={onClose}>Отмена</button><button className="button button--dark" disabled={!!busy} onClick={save}><Icon name="check" size={17} />Сохранить</button></div></div>
  </Modal>;
}
