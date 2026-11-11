export const ORNAMENT_PATHS = [
  'M95 210C28 161 4 112 29 74c22-34 64-9 40 15-15 15-33-6-18-14M95 210c67-49 91-98 66-136-22-34-64-9-40 15 15 15 33-6 18-14M95 210V65c0-40-43-57-58-31-13 23 20 40 27 19M95 65c0-40 43-57 58-31 13 23-20 40-27 19M95 155c-46-30-66-12-49 9 16 18 30 16 49 46 19-30 33-28 49-46 17-21-3-39-49-9',
  'M95 124C63 86 73 49 95 16c22 33 32 70 0 108M0 0c30 50 28 69 0 110M190 0c-30 50-28 69 0 110M0 220c30-50 28-69 0-110M190 220c-30-50-28-69 0-110',
];

export function coverSvg(back = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1400" viewBox="0 0 600 600">
    <defs><radialGradient id="surface" cx="48%" cy="10%" r="100%"><stop stop-color="#373938"/><stop offset=".46" stop-color="#292c2b"/><stop offset="1" stop-color="#222524"/></radialGradient>
    <linearGradient id="spine"><stop stop-color="#000" stop-opacity=".38"/><stop offset=".3" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <pattern id="damask" width="190" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><g fill="none" stroke="#777b75" stroke-width="1.6" opacity=".24">${ORNAMENT_PATHS.map((path) => `<path d="${path}"/>`).join('')}</g></pattern></defs>
    <rect width="600" height="600" fill="url(#surface)"/><rect width="600" height="600" fill="url(#damask)"/>
    <rect width="66" height="600" fill="url(#spine)"/>
    ${back ? '<text x="300" y="316" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif" font-size="44" font-weight="300" fill="#eeeee7" opacity=".4">ТС</text>' : `<g font-family="Helvetica Neue,Arial,sans-serif" fill="#f1f0e9"><text x="102" y="132" font-size="53" font-weight="650" letter-spacing="3.7">ТИХИЕ</text><text x="102" y="186" font-size="53" font-weight="650" letter-spacing="2.7">СТЕНЫ</text><path d="M102 326h40" stroke="#e7e6df" stroke-opacity=".52"/><text x="102" y="374" font-size="27" font-weight="350" letter-spacing="6.8">КАТАЛОГ</text><text x="102" y="529" font-size="10" letter-spacing="2.5" opacity=".65">АРХИТЕКТУРА СТИЛЯ</text></g>`}
  </svg>`;
}
