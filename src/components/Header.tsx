import { useEffect, useState } from 'react';

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return <span className={`wordmark ${compact ? 'wordmark--compact' : ''}`} aria-label="Тихие Стены"><span>ТИХИЕ</span><span>СТЕНЫ</span></span>;
}

export function Header({ logo, onCatalog, onContacts }: { logo: string; onCatalog: () => void; onContacts: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [logo]);
  return <header className="site-header">
    <a href="#catalog" className="header-logo" onClick={(event) => { event.preventDefault(); onCatalog(); }} aria-label="Тихие Стены — к обложке каталога">
      {logo && !logoFailed ? <img src={logo} alt="Тихие Стены" onError={() => setLogoFailed(true)} /> : <Wordmark />}
    </a>
    <nav aria-label="Основная навигация">
      <a href="#catalog" className="nav-link nav-link--active" onClick={(event) => { event.preventDefault(); onCatalog(); }}>КАТАЛОГ</a>
      <button className="nav-link" onClick={onContacts}>КОНТАКТЫ</button>
    </nav>
  </header>;
}
