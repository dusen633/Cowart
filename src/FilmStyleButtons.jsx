import { FILM_STYLES } from './filmConfig.js'

export function FilmStyleButtons({ styleId, disabled, onChange }) {
  return (
    <div aria-label="影片风格" className="cowart-film-styles" role="group">
      {FILM_STYLES.map((item) => (
        <button aria-pressed={item.id === styleId} disabled={disabled} key={item.id}
          onClick={() => onChange(item.id)} title={item.description} type="button">
          <FilmStyleIcon styleId={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// Small, semantic SVG parts let each hover gesture describe its film style.
// Animation belongs to the button in CSS; the icon stays decorative for AT.
function FilmStyleIcon({ styleId }) {
  let drawing
  switch (styleId) {
    case 'product-launch':
      drawing = (
        <g className="cowart-film-icon-rocket">
          <path d="M9 12H4l2-4 5-1M12 15v5l4-2 1-5" />
          <path d="m9 12 3 3c5-2 9-6 9-12-6 0-10 4-12 9Z" />
          <circle cx="16" cy="8" r="1.5" />
          <path className="cowart-film-icon-flame" d="M7 17c-2-1-3 1-3.5 3.5C6 20 8 19 7 17Z" />
        </g>
      )
      break
    case 'kinetic-type':
      drawing = (
        <>
          <path className="cowart-film-icon-type-main" d="M3 6h12M9 6v13" />
          <path className="cowart-film-icon-type-small" d="M15 11h6M18 11v8" />
        </>
      )
      break
    case 'abstract-physics':
      drawing = (
        <>
          <g className="cowart-film-icon-orbits">
            <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(45 12 12)" />
            <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-45 12 12)" />
          </g>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </>
      )
      break
    case 'editorial-story':
      drawing = (
        <>
          <path d="M3 10.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8.5" />
          <g className="cowart-film-icon-clapper">
            <path d="M3 6.5h18v4H3Z" />
            <path d="m8 6.5-2 4m8-4-2 4m8-4-2 4" />
          </g>
        </>
      )
      break
    case 'data-flow':
      drawing = (
        <>
          <path d="M7 5.5h3a2 2 0 0 1 2 2v9a2 2 0 0 0 2 2h3" />
          <rect x="2" y="3" width="5" height="5" rx="1.2" />
          <rect className="cowart-film-icon-flow-target" x="17" y="16" width="5" height="5" rx="1.2" />
          <circle className="cowart-film-icon-flow-packet" cx="7" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
        </>
      )
      break
    default:
      return null
  }
  return (
    <svg aria-hidden="true" focusable="false" className="cowart-film-style-icon"
      viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {drawing}
    </svg>
  )
}
