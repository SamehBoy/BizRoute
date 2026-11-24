import { CarFront, Check, MapPin, Navigation2, UsersRound } from "lucide-react";

export function HeroMap() {
  return <figure className="hero-map" aria-label="Illustrated carpool route with two pickups on the way to an event">
    <svg className="map-drawing" viewBox="0 0 640 487" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="street-grid" width="44" height="35" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
          <path d="M0 0H44 M0 0V35" stroke="#fbfdff" strokeWidth="7" fill="none" />
          <path d="M0 0H44 M0 0V35" stroke="#dce6f2" strokeWidth="1" fill="none" />
          <path d="M21 0V35" stroke="#f7faff" strokeWidth="2" />
        </pattern>
        <pattern id="water-ripples" width="39" height="19" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <path d="M4 12h13m9-7h7" stroke="#b5d2ef" strokeWidth="1" strokeLinecap="round" />
        </pattern>
        <filter id="route-shadow" x="-15%" y="-20%" width="130%" height="145%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#18345b" floodOpacity=".2" />
        </filter>
      </defs>
      <path d="M0 0h640v487H0z" fill="#e9eff8" />
      <path d="M0 0h640v487H0z" fill="url(#street-grid)" />
      <path d="M-20 333L65 312l47 39-3 64-54 30-75-24z M319 62l67-24 54 25-11 42-69 30-37-25z M514 274l72-12 49 38-9 51-62 16-50-25z" fill="#dce9e7" stroke="#f7fbfd" strokeWidth="4" />
      <path d="M-19 106C64 70 100 82 145 53S188 13 229-8 M-15 277C86 236 150 243 217 210S342 152 412 176 525 174 667 116 M49 508C64 441 122 395 155 350S201 265 233 211 349 143 368 101 394 16 419-15 M398 515C363 447 369 395 412 362S518 319 555 261 576 149 632 120" fill="none" stroke="#d4e0ef" strokeWidth="16" />
      <path d="M-19 106C64 70 100 82 145 53S188 13 229-8 M-15 277C86 236 150 243 217 210S342 152 412 176 525 174 667 116 M49 508C64 441 122 395 155 350S201 265 233 211 349 143 368 101 394 16 419-15 M398 515C363 447 369 395 412 362S518 319 555 261 576 149 632 120" fill="none" stroke="#fcfdff" strokeWidth="11" />
      <path d="M-40 23C65 12 101 55 152 47S252 23 294 9 366-24 408-29H-40Z M674 309C619 319 593 356 580 386S523 444 484 452 411 457 398 508h280Z" fill="#c9dff5" stroke="#b7d2ee" strokeWidth="3" />
      <path d="M-40 23C65 12 101 55 152 47S252 23 294 9 366-24 408-29H-40Z M674 309C619 319 593 356 580 386S523 444 484 452 411 457 398 508h280Z" fill="url(#water-ripples)" />
      <path d="M378 418l118-37 78-14 80 2" fill="none" stroke="#f8fbff" strokeWidth="8" />
      <path d="M124 351l29-24c14-12 20-19 22-33l11-54c2-12 11-19 23-22l46-11c12-3 18-10 21-19l11-33c4-13 12-20 23-22l74-17c10-2 18 1 24 7l37 33c8 6 15 7 24 4l46-14" fill="none" stroke="white" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#route-shadow)" />
      <path d="M124 351l29-24c14-12 20-19 22-33l11-54c2-12 11-19 23-22l46-11c12-3 18-10 21-19l11-33c4-13 12-20 23-22l74-17c10-2 18 1 24 7l37 33c8 6 15 7 24 4l46-14" fill="none" stroke="var(--blue)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="#fff" stroke="var(--blue)" strokeWidth="4">
        <circle cx="185" cy="246" r="11" />
        <circle cx="334" cy="128" r="11" />
      </g>
      <g fill="var(--blue)" textAnchor="middle" fontSize="11" fontFamily="Manrope Variable, sans-serif" fontWeight="800">
        <text x="185" y="250">1</text><text x="334" y="132">2</text>
      </g>
    </svg>
    <div className="map-example"><span /> Example route</div>
    <div className="map-spot spot-start"><CarFront size={20} strokeWidth={2.5} /></div>
    <div className="map-spot spot-end"><MapPin size={21} strokeWidth={2.4} /></div>
    <div className="map-caption map-start"><Navigation2 size={13} /> Driver starts</div>
    <div className="map-caption map-end">Event venue</div>
    <div className="map-route-card">
      <span className="map-card-icon"><UsersRound size={21} /></span>
      <span><strong>Carpool matched</strong><small>1 driver · 2 pickups</small></span>
      <Check size={17} className="map-card-check" />
    </div>
  </figure>;
}
