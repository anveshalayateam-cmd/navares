import { Database, Info, MoreVertical, Radio, RotateCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarsClockWidget } from './MarsClockWidget';

export type InfoModalType = 'rescue' | 'details' | 'about' | null;

interface InfoMenuProps {
  hasTargetCardOpen: boolean;
}

const DATA_ATTRIBUTIONS = [
  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className="font-mono-tabular text-slate-200">232m/px</span>) &amp; Mars Reconnaissance
        Orbiter (MRO) CTX Global Mosaic (
        <span className="font-mono-tabular text-slate-200">6m/px</span>) —{' '}
        <em className="text-slate-300">NASA / JPL-Caltech / USGS Astrogeology Science Center</em>.
      </>
    ),
  },
  {
    title: 'Martian Atmospheric Cloud Layer (AI-Generated Procedural)',
    description: (
      <>
        Global translucent water-ice and aerosol cloud veil (always present, slightly dim) —
        invisible straight-on while emerging smoothly along planetary edges and horizons — is
        procedurally generated with AI assistance, inspired by orbital photography from{' '}
        <em className="text-slate-300">
          ESA Rosetta OSIRIS, ESA Mars Express (VMC/HRSC) &amp; NASA MRO (MARCI)
        </em>
        .
      </>
    ),
  },
  {
    title: 'MGS Crustal Magnetic Field & MOLA Topography',
    description: (
      <>
        Mars Global Surveyor (MGS) Mars Orbiter Laser Altimeter (MOLA) Digital Elevation Model (
        <span className="font-mono-tabular text-slate-200">463m/px</span>) &amp; crustal magnetic
        anomaly maps — <em className="text-slate-300">NASA Goddard Space Flight Center / USGS</em>.
      </>
    ),
  },
  {
    title: 'NASA SWIM Project (Subsurface Water Ice Mapping)',
    description: (
      <>
        Radar, neutron, and thermal-inertia mapping of shallow buried Martian water-ice sheets —{' '}
        <em className="text-slate-300">Planetary Science Institute / NASA JPL</em>.
      </>
    ),
  },
  {
    title: 'NASA 2001 Mars Odyssey Water & Hydrogen Distribution (GRS / NS)',
    description: (
      <>
        Site habitability water-availability evaluation uses official calibrated 5°×5° smoothed
        Gamma-Ray Spectrometer <span className="font-mono-tabular text-slate-200">H₂O</span>{' '}
        concentrations (wt% &amp; 1σ uncertainties) from{' '}
        <span className="font-mono-tabular text-slate-200">ODY-M-GRS-5-ELEMENTS-V1.0</span>{' '}
        (Boynton et al., <em>J. Geophys. Res.</em> 2007,{' '}
        <a
          href="https://doi.org/10.1029/2007JE002887"
          target="_blank"
          rel="noreferrer"
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          doi:10.1029/2007JE002887
        </a>
        ) paired with Odyssey Neutron Spectrometer epithermal neutron flux (
        <span className="font-mono-tabular text-slate-200">urn:nasa:pds:odyssey_grs_special</span>,
        Feldman et al., <em>Science</em> 2002) for global and polar Water-Equivalent Hydrogen (WEH)
        mapping — <em className="text-slate-300">NASA PDS Geosciences Node / Washington Univ. in St. Louis</em>.
      </>
    ),
  },
  {
    title: 'USGS Planetary Nomenclature & Mars Crater Database',
    description: (
      <>
        Standardized Martian feature coordinates, delta basins, lava-tube skylights, and crater
        catalogs — <em className="text-slate-300">USGS Astrogeology Science Center / IAU</em>.
        Selected named-feature footprints use the Gazetteer’s approximate WKT outlines, not geologic perimeters.
      </>
    ),
  },
  {
    title: 'ESA Planetary Science Archive (PSA) & ISRO ISSDC',
    description: (
      <>
        Mars Express, ExoMars TGO, Schiaparelli EDM, and Mangalyaan (Mars Orbiter Mission) orbital
        and atmospheric datasets — <em className="text-slate-300">ESA PSA / ISRO ISSDC</em>.
      </>
    ),
  },
  {
    title: 'Surface Radiation Calibration',
    description: (
      <>
        Curiosity Rover Radiation Assessment Detector (MSL RAD) &amp; atmospheric column shielding
        models — <em className="text-slate-300">NASA / JPL-Caltech / SwRI</em>.
      </>
    ),
  },
  {
    title: 'Thermal & Weather Telemetry',
    description: (
      <>
        Curiosity (REMS), Perseverance (MEDA), and InSight Mars Weather Data —{' '}
        <em className="text-slate-300">NASA / JPL-Caltech / CAB</em>.
      </>
    ),
  },
  {
    title: 'NASA MGS TES Surface Temperature Retrievals',
    description: (
      <>
        Seasonal daytime grid uses quality-screened, recalibrated nadir surface-temperature retrievals
        from Mars Global Surveyor TES, converted from kelvin and binned by solar longitude. The
        composite uses 12 selected archive orbit files; it is not live weather or a complete global
        climatology. Transparent areas mark cells with no valid retrievals. Dataset: Pankine et al.,
        NASA PDS Atmospheres Node, DOI{' '}
        <a
          href="https://doi.org/10.17189/xhqz-zw13"
          target="_blank"
          rel="noreferrer"
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          10.17189/xhqz-zw13
        </a>
        .
      </>
    ),
  },
  {
    title: 'Loading Screen Mars Image — AI-Generated Illustration',
    description: (
      <>
        AI-generated artistic depiction of Mars used as the loading-screen background. This
        image is synthetic and illustrative; it is not a real photograph, official mission
        image, or direct observation of Mars. It should not be interpreted as scientifically
        verified imagery or as an accurate record of actual surface conditions.
      </>
    ),
  },
  {
    title: 'Mission Photography',
    description: (
      <>
        Official public-domain rover &amp; spacecraft imagery —{' '}
        <em className="text-slate-300">
          NASA / JPL-Caltech / MSSS / ESA / CNSA / Wikimedia Commons
        </em>
        .
      </>
    ),
  },
  {
    title: 'VHF/UHF Surface Radio Propagation & Terrain LOS Model',
    description: (
      <>
        400 MHz free-space path loss, Martian planetary horizon curvature, MOLA knife-edge ridge
        diffraction, and autonomous rover/orbiter UHF emergency relay repeaters for non-GPS surface
        direction finding.
      </>
    ),
  },
  {
    title: '3D Globe Engine',
    description: (
      <>
        Powered by open-source <em className="text-slate-300">CesiumJS</em>.
      </>
    ),
  },
  {
    title: 'Background Starfield',
    description: (
      <>
        Background Starfield: Hipparcos / Tycho-2 astronomical star catalog data (NASA/Goddard SVS
        / CesiumJS).
      </>
    ),
  },
];

const COMPASS_DIRS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

function bearingToCardinal(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_DIRS[idx];
}

// Base beacon sits at 042 deg relative to default 0 deg astronaut orientation
const BEACON_BASE_AZIMUTH_DEG = 42;

export function InfoMenu({ hasTargetCardOpen }: InfoMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<InfoModalType>(null);
  const [astronautFacingDeg, setAstronautFacingDeg] = useState<number>(0);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Capture-phase global pointerdown closes dropdown even when clicking on Cesium canvas
  useEffect(() => {
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (!menuOpen) return;
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownCapture, { capture: true });
    };
  }, [menuOpen]);

  // Escape closes active modal or dropdown before global shortcuts fire
  useEffect(() => {
    if (!menuOpen && !activeModal) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (activeModal) {
          setActiveModal(null);
        } else if (menuOpen) {
          setMenuOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
    };
  }, [menuOpen, activeModal]);

  const openModal = (modal: Exclude<InfoModalType, null>) => {
    setMenuOpen(false);
    setActiveModal(modal);
  };

  // Interactive Detachable Spacesuit RDF Remote telemetry
  const relativeBearingDeg =
    ((BEACON_BASE_AZIMUTH_DEG - astronautFacingDeg) % 360 + 360) % 360;
  const paddedBearing = String(Math.round(relativeBearingDeg) % 360).padStart(3, '0');
  const cardinalDir = bearingToCardinal(relativeBearingDeg);
  const thetaRad = (relativeBearingDeg * Math.PI) / 180;
  const directionalGain = 0.5 + 0.5 * Math.cos(thetaRad);
  const intensityPct = Math.round(22 + 75 * Math.pow(directionalGain, 0.9));
  const signalDbm = Math.round(-89 + (intensityPct / 100) * 40);
  const isStrongLock = relativeBearingDeg <= 30 || relativeBearingDeg >= 330;
  const signalStatus =
    intensityPct >= 82 ? 'STRONG LOCK' : intensityPct >= 52 ? 'NOMINAL RDF' : 'SUIT SHADOW';

  return (
    <>
      {/* Top-Right 3-Dot Menu Container */}
      <div
        ref={menuContainerRef}
        className={`fixed top-4 right-4 z-40 flex items-center transition-all duration-200 ease-out ${
          hasTargetCardOpen
            ? 'md:-translate-x-[367px] max-md:pointer-events-none max-md:opacity-0 max-md:scale-95 pointer-events-auto'
            : 'translate-x-0 opacity-100 scale-100 pointer-events-auto'
        }`}
      >
        <MarsClockWidget />
        {/* Circular 3-Dot Menu Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open menu for astronaut rescue, details, and about"
            title="Menu"
            className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md shadow-2xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75 ${
              menuOpen
                ? 'border-orange-400/50 bg-[#0B0F17]/92 text-white'
                : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Atlas information menu"
              className="absolute right-0 mt-2 w-48 origin-top-right rounded-2xl border border-white/15 bg-[#0B0F17]/92 p-1.5 backdrop-blur-md shadow-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => openModal('rescue')}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/15 hover:text-white cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/75"
              >
                <Radio className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>Astronaut Rescue</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => openModal('details')}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
              >
                <Database className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
                <span>Details</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => openModal('about')}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
              >
                <Info className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                <span>About</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Centered Glassmorphism Modal Dialogs */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-modal-title"
          onClick={() => setActiveModal(null)}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative flex max-h-[calc(100vh-2.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/94 text-slate-100 backdrop-blur-xl shadow-2xl ${
              activeModal === 'rescue' ? 'max-w-2xl' : 'max-w-xl'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-amber-300/90">
                  {activeModal === 'rescue'
                    ? 'Original Non-GPS EVA Survival Hardware Concept'
                    : activeModal === 'details'
                      ? 'Scientific Calibration & Imagery Provenance'
                      : 'NASA International Space Apps Challenge'}
                </p>
                <h2
                  id="info-modal-title"
                  className="mt-0.5 font-display text-base sm:text-lg font-bold tracking-tight text-white"
                >
                  {activeModal === 'rescue'
                    ? 'Martian Surface Rescue Protocol: Radio Direction-Finding (RDF) Homing System'
                    : activeModal === 'details'
                      ? 'Details & Data Sources'
                      : 'About'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close modal"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/75"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="hud-scroll flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {activeModal === 'rescue' ? (
                <>
                  {/* Interactive Detachable Spacesuit RDF Remote Mockup & Simulator */}
                  <div className="rounded-2xl border border-emerald-400/25 bg-[#060B0E]/90 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                        <span className="text-xs font-semibold text-white">
                          Interactive Preview: Detachable Spacesuit RDF Remote
                        </span>
                      </div>
                      <span className="font-mono-tabular text-[11px] text-emerald-300/90">
                        400 MHz VHF/UHF · Dual-Antenna
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[248px_1fr] gap-4 items-center">
                      {/* Ruggedized EVA Handheld/Wrist Remote Hardware SVG + Live Digital Screen */}
                      <div className="mx-auto w-[240px] select-none">
                        {/* Dual Top RDF Whip Antennas */}
                        <div className="flex justify-between px-9">
                          <div className="flex flex-col items-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#FBBF24]" />
                            <div className="h-6 w-1 rounded-t bg-gradient-to-b from-slate-300 to-slate-600" />
                            <span className="font-mono-tabular text-[8px] text-slate-400 -mt-0.5">
                              ANT-A
                            </span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399]" />
                            <div className="h-6 w-1 rounded-t bg-gradient-to-b from-slate-300 to-slate-600" />
                            <span className="font-mono-tabular text-[8px] text-slate-400 -mt-0.5">
                              ANT-B
                            </span>
                          </div>
                        </div>

                        {/* Ruggedized Titanium Chassis */}
                        <div className="relative rounded-2xl border-2 border-slate-600/80 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.8)]">
                          {/* Quick-Detach Wrist/Chest Rail Latches */}
                          <div className="mb-2 flex items-center justify-between text-[9px] font-mono-tabular text-slate-400">
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700">
                              EVA-RDF-01
                            </span>
                            <span
                              className={`font-semibold ${
                                isStrongLock ? 'text-emerald-300' : 'text-amber-300'
                              }`}
                            >
                              {signalStatus}
                            </span>
                          </div>

                          {/* Glowing Digital OLED Screen */}
                          <div className="relative overflow-hidden rounded-xl border border-emerald-400/40 bg-[#030A07] p-3 shadow-[inset_0_0_24px_rgba(16,185,129,0.16)]">
                            {/* Subtle Tactical Reticle Ring + Live Rotating Homing Arrow */}
                            <div className="mx-auto flex h-28 w-28 items-center justify-center">
                              <svg
                                viewBox="0 0 112 112"
                                className="h-28 w-28"
                                role="img"
                                aria-label={`RDF homing arrow pointing ${paddedBearing} degrees ${cardinalDir}`}
                              >
                                <circle
                                  cx="56"
                                  cy="56"
                                  r="50"
                                  fill="rgba(16, 185, 129, 0.05)"
                                  stroke="rgba(52, 211, 153, 0.25)"
                                  strokeWidth="1.2"
                                />
                                <circle
                                  cx="56"
                                  cy="56"
                                  r="36"
                                  fill="none"
                                  stroke="rgba(52, 211, 153, 0.16)"
                                  strokeDasharray="3 3"
                                  strokeWidth="1"
                                />
                                <line
                                  x1="56"
                                  y1="8"
                                  x2="56"
                                  y2="14"
                                  stroke="#34D399"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x="56"
                                  y="23"
                                  textAnchor="middle"
                                  fill="#6EE7B7"
                                  fontSize="7"
                                  fontWeight="700"
                                >
                                  FWD
                                </text>
                                <text
                                  x="97"
                                  y="58.5"
                                  textAnchor="middle"
                                  fill="#475569"
                                  fontSize="6.5"
                                >
                                  90
                                </text>
                                <text
                                  x="56"
                                  y="100"
                                  textAnchor="middle"
                                  fill="#475569"
                                  fontSize="6.5"
                                >
                                  180
                                </text>
                                <text
                                  x="15"
                                  y="58.5"
                                  textAnchor="middle"
                                  fill="#475569"
                                  fontSize="6.5"
                                >
                                  270
                                </text>

                                {/* Rotating Directional Homing Arrow */}
                                <g
                                  style={{
                                    transform: `rotate(${relativeBearingDeg}deg)`,
                                    transformOrigin: '56px 56px',
                                    transition: 'transform 120ms ease-out',
                                  }}
                                >
                                  <polygon
                                    points="56,16 66,52 56,45 46,52"
                                    fill={isStrongLock ? '#00FF41' : '#FBBF24'}
                                  />
                                  <line
                                    x1="56"
                                    y1="45"
                                    x2="56"
                                    y2="82"
                                    stroke={isStrongLock ? '#00FF41' : '#FBBF24'}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="56" cy="56" r="4" fill="#F8FAFC" />
                                </g>
                              </svg>
                            </div>

                            {/* High-Contrast Digital Bearing & Radio Wave Intensity Readouts */}
                            <div className="mt-1.5 border-t border-emerald-400/20 pt-2 text-center space-y-1">
                              <div className="font-mono-tabular text-sm font-bold tracking-wide text-emerald-300">
                                BEARING: {paddedBearing}° {cardinalDir}
                              </div>
                              <div className="font-mono-tabular text-[11px] font-semibold text-amber-300">
                                SIGNAL: {signalDbm} dBm | {intensityPct}% INTENSITY
                              </div>
                              {/* Segmented RF Signal Bar */}
                              <div className="grid grid-cols-10 gap-0.5 pt-1" aria-hidden="true">
                                {Array.from({ length: 10 }).map((_, idx) => {
                                  const active = intensityPct >= (idx + 1) * 9.5;
                                  return (
                                    <span
                                      key={idx}
                                      className={`h-1.5 rounded-[2px] transition-colors ${
                                        active
                                          ? idx >= 7
                                            ? 'bg-[#00FF41]'
                                            : idx >= 4
                                              ? 'bg-emerald-400'
                                              : 'bg-amber-400'
                                          : 'bg-white/10'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Hardware Tactile Latch & Mode Buttons */}
                          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center font-mono-tabular text-[9px] text-slate-300">
                            <span className="rounded-md border border-white/10 bg-white/[0.04] py-1">
                              DETACH
                            </span>
                            <span className="rounded-md border border-emerald-400/30 bg-emerald-500/15 py-1 text-emerald-300">
                              RDF CH-1
                            </span>
                            <span className="rounded-md border border-white/10 bg-white/[0.04] py-1">
                              RELAY
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive "Test / Rotate Astronaut" Controls & Live Explanation */}
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <label
                              htmlFor="astronaut-rotate-slider"
                              className="font-semibold text-white"
                            >
                              Test / Rotate Astronaut Facing
                            </label>
                            <span className="font-mono-tabular text-amber-300 font-semibold">
                              {astronautFacingDeg}° Heading
                            </span>
                          </div>
                          <input
                            id="astronaut-rotate-slider"
                            type="range"
                            min={0}
                            max={359}
                            value={astronautFacingDeg}
                            onChange={(e) => setAstronautFacingDeg(Number(e.target.value))}
                            className="w-full accent-amber-400 cursor-pointer"
                          />
                          <div className="mt-1 flex justify-between font-mono-tabular text-[10px] text-slate-400">
                            <span>0°</span>
                            <span>90°</span>
                            <span>180°</span>
                            <span>270°</span>
                            <span>359°</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setAstronautFacingDeg((prev) => (prev + 45) % 360)
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/25 hover:text-white cursor-pointer whitespace-nowrap"
                          >
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Rotate Astronaut +45°</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAstronautFacingDeg(0)}
                            className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/15 hover:text-white cursor-pointer whitespace-nowrap"
                          >
                            Reset (042° NE)
                          </button>
                        </div>

                        <p className="text-[11px] leading-relaxed text-slate-300">
                          Rotating the astronaut dynamically shifts the relative bearing arrow and
                          dual-antenna reception intensity. When facing the base beacon (within
                          ±30°), radio wave intensity peaks near{' '}
                          <span className="font-mono-tabular text-emerald-300">-50 dBm</span>; facing
                          away introduces EVA suit shadowing and drops intensity.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* The Martian Navigation Problem */}
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold tracking-wide text-orange-300">
                      The Martian Navigation Problem
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Mars has <strong className="text-white">no GPS constellation</strong> and{' '}
                      <strong className="text-white">no global magnetic field</strong> for standard
                      compasses. Astronauts caught in blinding global dust storms or rugged canyons
                      can quickly lose visual contact with their lander and become disoriented.
                    </p>
                  </div>

                  {/* The Proposed Solution */}
                  <div className="border-t border-white/10 pt-3.5 space-y-2.5">
                    <h3 className="text-xs font-semibold tracking-wide text-emerald-300">
                      The Proposed Solution (Landing Beacon + Detachable Spacesuit Remote)
                    </h3>
                    <ol className="space-y-2 text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      <li>
                        <strong className="text-white">
                          1. Landing Site Radio Transceiver Beacon:
                        </strong>{' '}
                        Upon touchdown on Mars, astronauts deploy a compact, high-efficiency VHF/UHF
                        radio beacon at the lander/habitat base that continuously broadcasts an
                        omnidirectional homing pulse capable of penetrating dust storms and
                        diffracting around crater rims.
                      </li>
                      <li>
                        <strong className="text-white">2. Detachable Spacesuit RDF Remote:</strong>{' '}
                        Every astronaut spacesuit is equipped with a rugged,{' '}
                        <strong className="text-white">detachable wrist/chest remote receiver</strong>{' '}
                        utilizing dual-antenna{' '}
                        <strong className="text-white">Radio Direction-Finding (RDF)</strong>. If an
                        astronaut becomes separated or disoriented, they detach the remote to
                        navigate back safely without relying on satellites or magnetic compasses.
                      </li>
                      <li>
                        <strong className="text-white">
                          3. Rover &amp; Orbiter Relay Integration:
                        </strong>{' '}
                        If steep canyon terrain blocks direct line-of-sight to the lander, nearby
                        surface rovers (prioritized first) and overhead orbiters act as emergency
                        radio signal repeaters.
                      </li>
                    </ol>
                  </div>
                </>
              ) : activeModal === 'details' ? (
                <>
                  {/* Highlighted Scientific Scale Note Callout */}
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.08] p-4 space-y-2">
                    <div className="text-xs font-semibold text-amber-300 mb-1">
                      Scientific Scale Note
                    </div>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-amber-100/95">
                      Note: Vector sprites and 3D/2D visual representations of rovers, landers, and
                      orbiting satellites are enlarged{' '}
                      <span className="font-mono-tabular font-semibold text-amber-200">~1,000×</span>{' '}
                      relative to planetary scale for better visual clarity and interactive
                      experience.
                    </p>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-amber-100/95">
                      Note: Custom 2D/3D vector sprites for rovers, landers, and orbiting satellites
                      were generated with AI assistance.
                    </p>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-amber-100/95">
                      Disclaimer: 3D terrain heights, vertical exaggeration, and surface location
                      markers are visual approximations for mission planning simulation and may
                      differ from actual Martian topography and coordinates.
                    </p>
                  </div>

                  {/* NASA & Open Data Attributions */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-300">
                      NASA &amp; Open Data Attributions
                    </h3>
                    <dl className="divide-y divide-white/10 border-t border-b border-white/10">
                      {DATA_ATTRIBUTIONS.map((item) => (
                        <div key={item.title} className="py-3 space-y-1">
                          <dt className="text-xs font-semibold text-white">{item.title}</dt>
                          <dd className="text-xs leading-relaxed text-slate-300">
                            {item.description}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </>
              ) : (
                <>
                  {/* Project Overview */}
                  <div className="space-y-2">
                    <h3 className="font-display text-base font-bold text-white">
                      Interplanetary Survival Guide: Martian Map
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Built for the{' '}
                      <span className="font-semibold text-orange-300">
                        NASA International Space Apps Challenge
                      </span>
                      . An interactive 3D Martian globe and survival navigation atlas designed to
                      help astronauts and researchers explore landing sites, monitor radiation and
                      thermal hazards, and plan safe surface traverses.
                    </p>
                  </div>

                  {/* Original Survival Innovation */}
                  <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-4 space-y-1.5">
                    <h3 className="text-xs font-semibold text-amber-300">
                      Original Survival Innovation: Surface RDF Beacon &amp; Rover Relay
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Because Mars lacks both a global GPS constellation and a planetary magnetic
                      compass field, this project introduces an original{' '}
                      <strong className="font-semibold text-white">
                        Astronaut Surface Radio Direction-Finding (RDF) Landing Beacon &amp;
                        Detachable Spacesuit Remote
                      </strong>{' '}
                      designed by <span className="font-semibold text-white">Jatin Kumar</span> and{' '}
                      <span className="font-semibold text-white">Raunak Kumar</span> for the NASA
                      Space Apps Challenge — enabling lost astronauts to home in through dust
                      storms via dual-antenna VHF/UHF bearings and automatic rover/orbiter relays.
                    </p>
                  </div>

                  {/* Developers */}
                  <div className="border-t border-white/10 pt-4 space-y-1.5">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-300">
                      Developers
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                     Created by three high school students:{' '}
<span className="font-semibold text-white">Jatin Kumar</span>,{' '}
<span className="font-semibold text-white">Raunak Kumar</span>, and{' '}
<span className="font-semibold text-white">Jasraj Singh</span>.

                    </p>
                  </div>

                  {/* AI Assistance & Tool Disclosure */}
                  <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.07] p-4 space-y-1.5">
                    <h3 className="text-xs font-semibold text-cyan-300">
                      AI Assistance &amp; Tool Disclosure (NASA Space Apps Compliance)
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
                      Developed with the assistance of AI tools — including{' '}
                      <strong className="font-semibold text-white">Google AI Studio (Gemini)</strong>,{' '}
                      <strong className="font-semibold text-white">Manus</strong>,{' '}
                      <strong className="font-semibold text-white">OpenHands</strong>,{' '}
                      <strong className="font-semibold text-white">Google AI</strong>, and{' '}
                      <strong className="font-semibold text-white">ChatGPT</strong>,{' '}
                       <strong className="font-semibold text-white">Grok</strong> — used for code
                      architecture, CesiumJS geospatial debugging, dataset structuring, UI
                      refinement, shader/lighting adjustments, and generating custom SVG/vector
                      spacecraft sprites.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
