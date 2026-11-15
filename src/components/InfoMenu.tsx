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
        <span className="font-mono-tabular text-slate-200">232m/px</span>) & Mars Reconnaissance
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
          ESA Rosetta OSIRIS, ESA Mars Express (VMC/HRSC) & NASA MRO (MARCI)
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
        <span className="font-mono-tabular text-slate-200">463m/px</span>) & crustal magnetic
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
        concentrations (wt% & 1σ uncertainties) from{' '}
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
        Curiosity Rover Radiation Assessment Detector (MSL RAD) & atmospheric column shielding
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
    title: 'Mission Photography',
    description: (
      <>
        Official public-domain rover & spacecraft imagery —{' '}
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
