import { useRef, useState } from 'react';
import type { BookProps } from './bookTypes';
import { FlatCatalogBook } from './FlatCatalogBook';
import { Book3D } from './Book3D';

export type { BookHandle } from './bookTypes';

export function CatalogBook(props: BookProps) {
  const [unavailable, setUnavailable] = useState('');
  const page = useRef(props.initialPage ?? 0);
  const onPageChange: BookProps['onPageChange'] = (nextPage, portrait) => { page.current = nextPage; props.onPageChange(nextPage, portrait); };
  return <div className="catalog-book">
    {unavailable && <div className="book-fallback-notice" role="status"><span>{unavailable}</span><button onClick={() => setUnavailable('')}>Повторить 3D</button></div>}
    {unavailable ? <FlatCatalogBook {...props} initialPage={page.current} onPageChange={onPageChange} /> : <Book3D {...props} initialPage={page.current} onPageChange={onPageChange} onUnavailable={setUnavailable} />}
  </div>;
}
