import { Wordmark } from './Header';
import { ORNAMENT_PATHS } from '../book3d/coverArtwork';

function Ornament() {
  return <svg className="cover-ornament" viewBox="0 0 600 600" fill="none" aria-hidden="true">
    <defs>
      <pattern id="damask" width="190" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <g stroke="currentColor" strokeWidth="1.6">
          {ORNAMENT_PATHS.map((path) => <path key={path} d={path} />)}
        </g>
      </pattern>
    </defs>
    <rect width="600" height="600" fill="url(#damask)" />
  </svg>;
}

export function BookCover({ image, back = false }: { image: string; back?: boolean }) {
  return <div className={`cover-face ${back ? 'cover-face--back' : ''}`}>
    {image && !back ? <img className="cover-photo" src={image} alt="Обложка каталога Тихие Стены" draggable="false" /> : <>
      <Ornament />
      {!back && <div className="cover-content"><Wordmark compact /><span className="cover-rule" /><span className="cover-title">КАТАЛОГ</span><span className="cover-tagline">АРХИТЕКТУРА СТИЛЯ</span></div>}
      {back && <div className="back-monogram">ТС</div>}
    </>}
    <div className="cover-spine" />
    {!image && !back && <div className="cover-fasteners">{[0, 1, 2, 3].map((item) => <i className="cover-stud" key={item} />)}</div>}
  </div>;
}
