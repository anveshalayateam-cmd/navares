import {
  MARS_CONSTANTS,
  MARS_TARGETS,
  MarsTarget,
  getMarsElevation,
} from '../data/marsData';
import { sampleSatelliteOrbitArc } from './marsMath';
import { computeSurfaceRadiationDose, getMarsSurfaceTempC } from './marsOverlayMaps';

const MARS_RADIUS_KM = MARS_CONSTANTS.EQUATORIAL_RADIUS / 1000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface RouteEndpoint {
  latDeg: number;
  lonDeg: number;
  elevMeters: number;
  label?: string;
}

export interface RouteWaypoint {
  latDeg: number;
  lonDeg: number;
  elevMeters: number;
  radDose: number;
  tempC: number;
}

export interface RoverEncounter {
  target: MarsTarget;
  closestKm: number;
  detourKm: number;
  supportNote: string;
}

export interface OrbiterEncounter {
  target: MarsTarget;
  closestKm: number;
  crossLatDeg: number;
  crossLonDeg: number;
}

export interface SurvivalRouteResult {
  start: RouteEndpoint;
  destination: RouteEndpoint;
  waypoints: RouteWaypoint[];
  directArcPoints: Array<{ latDeg: number; lonDeg: number }>;
  optimalDistanceKm: number;
  directDistanceKm: number;
  detourPercent: number;
  avgRadiationMsVDay: number;
  peakRadiationMsVDay: number;
  directPeakRadiationMsVDay: number;
  meanTempC: number;
  maxElevationM: number;
  minElevationM: number;
  roverEncounters: RoverEncounter[];
  orbiterEncounters: OrbiterEncounter[];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function wrapLongitudeDeg(lonDeg: number): number {
  let lon = ((lonDeg + 180) % 360 + 360) % 360 - 180;
  if (lon === -180 && lonDeg > 0) lon = 180;
  return lon;
}

export function wrapLonDiffDeg(lonA: number, lonB: number): number {
  let d = lonA - lonB;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function marsGeodesicKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLam = wrapLonDiffDeg(lon2, lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dPhi * 0.5) * Math.sin(dPhi * 0.5) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam * 0.5) * Math.sin(dLam * 0.5);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return MARS_RADIUS_KM * c;
}

/**
 * Interpolates points along a spherical/ellipsoidal great-circle arc on Mars.
 */
function sampleGreatCircleArc(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  segments: number
): Array<{ latDeg: number; lonDeg: number }> {
  const p1 = lat1 * DEG_TO_RAD;
  const l1 = lon1 * DEG_TO_RAD;
  const p2 = lat2 * DEG_TO_RAD;
  const l2 = lon2 * DEG_TO_RAD;

  const x1 = Math.cos(p1) * Math.cos(l1);
  const y1 = Math.cos(p1) * Math.sin(l1);
  const z1 = Math.sin(p1);

  const x2 = Math.cos(p2) * Math.cos(l2);
  const y2 = Math.cos(p2) * Math.sin(l2);
  const z2 = Math.sin(p2);

  const dot = clamp(x1 * x2 + y1 * y2 + z1 * z2, -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const pts: Array<{ latDeg: number; lonDeg: number }> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let x: number;
    let y: number;
    let z: number;
    if (omega < 1e-5 || sinOmega < 1e-5) {
      x = x1 + (x2 - x1) * t;
      y = y1 + (y2 - y1) * t;
      z = z1 + (z2 - z1) * t;
      const norm = Math.hypot(x, y, z) || 1;
      x /= norm;
      y /= norm;
      z /= norm;
    } else {
      const w1 = Math.sin((1 - t) * omega) / sinOmega;
      const w2 = Math.sin(t * omega) / sinOmega;
      x = w1 * x1 + w2 * x2;
      y = w1 * y1 + w2 * y2;
      z = w1 * z1 + w2 * z2;
    }
    const latDeg = Math.asin(clamp(z, -1, 1)) * RAD_TO_DEG;
    const lonDeg = Math.atan2(y, x) * RAD_TO_DEG;
    pts.push({ latDeg, lonDeg });
  }
  return pts;
}

interface OrbiterTrackCache {
  target: MarsTarget;
  points: Array<{ latDeg: number; lonDeg: number }>;
}

let cachedOrbiterTracks: OrbiterTrackCache[] | null = null;

function getOrbiterGroundTracks(): OrbiterTrackCache[] {
  if (cachedOrbiterTracks) return cachedOrbiterTracks;

  const tracks: OrbiterTrackCache[] = [];
  for (const target of MARS_TARGETS) {
    if (target.category === 'satellite' && target.orbit) {
      const arc = sampleSatelliteOrbitArc(target, 0, 360, 64, false);
      const pts = arc.map((p) => {
        const r = Math.hypot(p.x, p.y, p.z) || 1;
        return {
          latDeg: Math.asin(clamp(p.z / r, -1, 1)) * RAD_TO_DEG,
          lonDeg: Math.atan2(p.y, p.x) * RAD_TO_DEG,
        };
      });
      tracks.push({ target, points: pts });
    }
  }
  cachedOrbiterTracks = tracks;
  return tracks;
}

class MinHeap {
  private nodes: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, fScore: number): void {
    this.nodes.push(node);
    this.scores.push(fScore);
    this.bubbleUp(this.nodes.length - 1);
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    const node = this.nodes[idx];
    const score = this.scores[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.scores[parentIdx] <= score) break;
      this.nodes[idx] = this.nodes[parentIdx];
      this.scores[idx] = this.scores[parentIdx];
      idx = parentIdx;
    }
    this.nodes[idx] = node;
    this.scores[idx] = score;
  }

  private sinkDown(idx: number): void {
    const len = this.nodes.length;
    const node = this.nodes[idx];
    const score = this.scores[idx];
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len && this.scores[left] < score) {
        smallest = left;
      }
      if (right < len && this.scores[right] < (smallest === idx ? score : this.scores[smallest])) {
        smallest = right;
      }
      if (smallest === idx) break;
      this.nodes[idx] = this.nodes[smallest];
      this.scores[idx] = this.scores[smallest];
      idx = smallest;
    }
    this.nodes[idx] = node;
    this.scores[idx] = score;
  }
}

interface NodeCostSample {
  latDeg: number;
  lonDeg: number;
  elev: number;
  rad: number;
  temp: number;
  baseWeight: number;
}

/**
 * Multi-objective A* astronaut survival pathfinder across Mars:
 *  - Minimizes surface radiation (MSL RAD model)
 *  - Maximizes thermal favorability (temperature model)
 *  - Minimizes elevation & steep uphill climbs (MOLA topography)
 *  - Maximizes encounters with Rovers/Landers (3.0x priority) & Orbiter ground-tracks (1.0x priority)
 */
export function computeOptimalSurvivalRoute(
  start: RouteEndpoint,
  destination: RouteEndpoint
): SurvivalRouteResult {
  const directDistanceKm = Math.max(
    1,
    marsGeodesicKm(start.latDeg, start.lonDeg, destination.latDeg, destination.lonDeg)
  );
  const directArcPoints = sampleGreatCircleArc(
    start.latDeg,
    start.lonDeg,
    destination.latDeg,
    destination.lonDeg,
    60
  );

  // Sample direct path peak radiation for safety comparison
  let directPeakRad = 0;
  for (const pt of directArcPoints) {
    const rad = computeSurfaceRadiationDose(pt.lonDeg, pt.latDeg);
    if (rad > directPeakRad) directPeakRad = rad;
  }

  const rovers = MARS_TARGETS.filter((t) => t.category === 'rover');
  const orbiterTracks = getOrbiterGroundTracks();

  const roverSigmaKm = clamp(directDistanceKm * 0.22, 180, 420);
  const roverSigma2 = 2 * roverSigmaKm * roverSigmaKm;
  const orbiterSigma2 = 2 * 180 * 180;

  // Choose adaptive local grid for regional traverses (<3,200 km) or global wrap-around 2° grid
  const isGlobal = directDistanceKm >= 3200;

  let rows: number;
  let cols: number;
  let minLat: number;
  let dLat: number;
  let minLon: number;
  let dLon: number;
  let wrapLon = false;

  if (isGlobal) {
    wrapLon = true;
    cols = 180;
    rows = 85;
    minLat = -84;
    dLat = 2.0;
    minLon = -179;
    dLon = 2.0;
  } else {
    cols = 56;
    rows = 56;
    const midLat = (start.latDeg + destination.latDeg) * 0.5;
    const dLonSigned = wrapLonDiffDeg(destination.lonDeg, start.lonDeg);
    const midLon = wrapLongitudeDeg(start.lonDeg + dLonSigned * 0.5);

    const halfLatSpan = clamp(Math.abs(destination.latDeg - start.latDeg) * 0.72 + 12, 12, 75);
    const cosMid = Math.max(0.25, Math.cos(midLat * DEG_TO_RAD));
    const halfLonSpan = clamp(
      Math.abs(dLonSigned) * 0.72 + 14 / cosMid,
      14,
      172
    );

    const latBottom = Math.max(-85, midLat - halfLatSpan);
    const latTop = Math.min(85, midLat + halfLatSpan);
    minLat = latBottom;
    dLat = (latTop - latBottom) / (rows - 1);
    minLon = midLon - halfLonSpan;
    dLon = (2 * halfLonSpan) / (cols - 1);
  }

  const totalNodes = rows * cols;
  const sampleCache = new Array<NodeCostSample | undefined>(totalNodes);

  const getNodeCoords = (row: number, col: number): { latDeg: number; lonDeg: number } => {
    const latDeg = clamp(minLat + row * dLat, -86, 86);
    const lonDeg = wrapLongitudeDeg(minLon + col * dLon);
    return { latDeg, lonDeg };
  };

  const evaluateNode = (idx: number, row: number, col: number): NodeCostSample => {
    const existing = sampleCache[idx];
    if (existing) return existing;

    const { latDeg, lonDeg } = getNodeCoords(row, col);
    const elev = getMarsElevation(latDeg, lonDeg);
    const rad = computeSurfaceRadiationDose(lonDeg, latDeg);
    const temp = getMarsSurfaceTempC(latDeg, lonDeg);

    // 1. Minimum Radiation (+weight)
    const radNorm = clamp((rad - 0.35) / 0.85, 0, 1);
    const radPenalty = 1.95 * radNorm;

    // 2. Maximum Temperature (-weight / cold penalty)
    const coldNorm = clamp((12 - temp) / 137, 0, 1);
    const tempPenalty = 1.05 * coldNorm;

    // 3. Minimum Elevation (+weight)
    const elevNorm = clamp((elev + 5000) / 26000, 0, 1);
    const elevPenalty = 1.5 * elevNorm;

    // 4. Attractive pull toward Rovers (3.0x priority) & Orbiter ground-tracks (1.0x priority)
    let bestRoverAff = 0;
    for (let i = 0; i < rovers.length; i++) {
      const r = rovers[i];
      const dKm = marsGeodesicKm(latDeg, lonDeg, r.latitude, r.longitude);
      if (dKm < roverSigmaKm * 2.5) {
        const aff = Math.exp(-(dKm * dKm) / roverSigma2);
        if (aff > bestRoverAff) bestRoverAff = aff;
      }
    }

    let bestOrbiterAff = 0;
    for (let i = 0; i < orbiterTracks.length; i++) {
      const pts = orbiterTracks[i].points;
      for (let j = 0; j < pts.length; j += 2) {
        const dKm = marsGeodesicKm(latDeg, lonDeg, pts[j].latDeg, pts[j].lonDeg);
        if (dKm < 420) {
          const aff = Math.exp(-(dKm * dKm) / orbiterSigma2);
          if (aff > bestOrbiterAff) bestOrbiterAff = aff;
        }
      }
    }

    const weightedAffinity = clamp((3.0 * bestRoverAff + 1.0 * bestOrbiterAff) / 3.0, 0, 1);
    const baseWeight = Math.max(
      0.28,
      (1.0 + radPenalty + tempPenalty + elevPenalty) * (1.0 - 0.58 * weightedAffinity)
    );

    const sample: NodeCostSample = { latDeg, lonDeg, elev, rad, temp, baseWeight };
    sampleCache[idx] = sample;
    return sample;
  };

  const snapToGrid = (latDeg: number, lonDeg: number): { row: number; col: number } => {
    const row = clamp(Math.round((latDeg - minLat) / dLat), 0, rows - 1);
    const lonOffset = wrapLon ? wrapLonDiffDeg(lonDeg, minLon) : wrapLonDiffDeg(lonDeg, minLon + cols * dLon * 0.5) + cols * dLon * 0.5;
    let col = Math.round(lonOffset / dLon);
    if (wrapLon) {
      col = ((col % cols) + cols) % cols;
    } else {
      col = clamp(col, 0, cols - 1);
    }
    return { row, col };
  };

  const startCell = snapToGrid(start.latDeg, start.lonDeg);
  const goalCell = snapToGrid(destination.latDeg, destination.lonDeg);
  const startIdx = startCell.row * cols + startCell.col;
  const goalIdx = goalCell.row * cols + goalCell.col;

  const gScore = new Float64Array(totalNodes);
  gScore.fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(totalNodes);
  parent.fill(-1);
  const closed = new Uint8Array(totalNodes);

  const goalCoords = getNodeCoords(goalCell.row, goalCell.col);
  gScore[startIdx] = 0;

  const openHeap = new MinHeap();
  const hStart = 0.28 * marsGeodesicKm(start.latDeg, start.lonDeg, goalCoords.latDeg, goalCoords.lonDeg);
  openHeap.push(startIdx, hStart);

  const neighborOffsets: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  let foundGoal = false;
  let expansions = 0;
  const maxExpansions = totalNodes * 2;

  while (openHeap.size > 0 && expansions < maxExpansions) {
    const currIdx = openHeap.pop();
    if (closed[currIdx]) continue;
    closed[currIdx] = 1;
    expansions++;

    if (currIdx === goalIdx) {
      foundGoal = true;
      break;
    }

    const currRow = Math.floor(currIdx / cols);
    const currCol = currIdx % cols;
    const currNode = evaluateNode(currIdx, currRow, currCol);

    for (let k = 0; k < neighborOffsets.length; k++) {
      const nRow = currRow + neighborOffsets[k][0];
      if (nRow < 0 || nRow >= rows) continue;

      let nCol = currCol + neighborOffsets[k][1];
      if (wrapLon) {
        nCol = (nCol + cols) % cols;
      } else if (nCol < 0 || nCol >= cols) {
        continue;
      }

      const nIdx = nRow * cols + nCol;
      if (closed[nIdx]) continue;

      const nextNode = evaluateNode(nIdx, nRow, nCol);
      const stepKm = Math.max(
        0.5,
        marsGeodesicKm(currNode.latDeg, currNode.lonDeg, nextNode.latDeg, nextNode.lonDeg)
      );

      // Uphill climb penalty between adjacent grid cells
      const climbM = Math.max(0, nextNode.elev - currNode.elev);
      const slopePenalty = clamp(climbM / (stepKm * 120), 0, 1.4);
      const avgWeight = 0.5 * (currNode.baseWeight + nextNode.baseWeight) + 0.65 * slopePenalty;

      const tentativeG = gScore[currIdx] + stepKm * avgWeight;
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        parent[nIdx] = currIdx;
        const h =
          0.28 *
          marsGeodesicKm(nextNode.latDeg, nextNode.lonDeg, goalCoords.latDeg, goalCoords.lonDeg);
        openHeap.push(nIdx, tentativeG + h);
      }
    }
  }

  // Reconstruct grid path
  let rawLatLons: Array<{ latDeg: number; lonDeg: number }> = [];
  if (foundGoal) {
    let curr = goalIdx;
    while (curr !== -1) {
      const r = Math.floor(curr / cols);
      const c = curr % cols;
      rawLatLons.push(getNodeCoords(r, c));
      curr = parent[curr];
    }
    rawLatLons.reverse();
  } else {
    rawLatLons = [...directArcPoints];
  }

  // Replace endpoints with exact user-clicked Start & Destination coordinates
  if (rawLatLons.length >= 2) {
    rawLatLons[0] = { latDeg: start.latDeg, lonDeg: start.lonDeg };
    rawLatLons[rawLatLons.length - 1] = {
      latDeg: destination.latDeg,
      lonDeg: destination.lonDeg,
    };
  } else {
    rawLatLons = [
      { latDeg: start.latDeg, lonDeg: start.lonDeg },
      { latDeg: destination.latDeg, lonDeg: destination.lonDeg },
    ];
  }

  // Two gentle hazard-preserving smoothing passes to eliminate grid stair-stepping
  for (let pass = 0; pass < 2 && rawLatLons.length > 3; pass++) {
    const nextPts: Array<{ latDeg: number; lonDeg: number }> = [rawLatLons[0]];
    for (let i = 1; i < rawLatLons.length - 1; i++) {
      const prev = rawLatLons[i - 1];
      const curr = rawLatLons[i];
      const next = rawLatLons[i + 1];

      const dPrev = wrapLonDiffDeg(prev.lonDeg, curr.lonDeg);
      const dNext = wrapLonDiffDeg(next.lonDeg, curr.lonDeg);
      const smoothLat = 0.25 * prev.latDeg + 0.5 * curr.latDeg + 0.25 * next.latDeg;
      const smoothLon = wrapLongitudeDeg(curr.lonDeg + 0.25 * (dPrev + dNext));

      const origRad = computeSurfaceRadiationDose(curr.lonDeg, curr.latDeg);
      const smoothRad = computeSurfaceRadiationDose(smoothLon, smoothLat);
      if (smoothRad <= origRad * 1.12) {
        nextPts.push({ latDeg: smoothLat, lonDeg: smoothLon });
      } else {
        nextPts.push(curr);
      }
    }
    nextPts.push(rawLatLons[rawLatLons.length - 1]);
    rawLatLons = nextPts;
  }

  // Sample metrics along the optimal path
  const waypoints: RouteWaypoint[] = rawLatLons.map((pt) => ({
    latDeg: pt.latDeg,
    lonDeg: pt.lonDeg,
    elevMeters: getMarsElevation(pt.latDeg, pt.lonDeg),
    radDose: computeSurfaceRadiationDose(pt.lonDeg, pt.latDeg),
    tempC: getMarsSurfaceTempC(pt.latDeg, pt.lonDeg),
  }));

  let optimalDistanceKm = 0;
  let weightedRadSum = 0;
  let weightedTempSum = 0;
  let peakRad = 0;
  let maxElevationM = -Infinity;
  let minElevationM = Infinity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (wp.radDose > peakRad) peakRad = wp.radDose;
    if (wp.elevMeters > maxElevationM) maxElevationM = wp.elevMeters;
    if (wp.elevMeters < minElevationM) minElevationM = wp.elevMeters;

    if (i > 0) {
      const prev = waypoints[i - 1];
      const segKm = marsGeodesicKm(prev.latDeg, prev.lonDeg, wp.latDeg, wp.lonDeg);
      optimalDistanceKm += segKm;
      weightedRadSum += segKm * 0.5 * (prev.radDose + wp.radDose);
      weightedTempSum += segKm * 0.5 * (prev.tempC + wp.tempC);
    }
  }

  const safeDist = Math.max(1, optimalDistanceKm);
  const avgRadiationMsVDay = weightedRadSum / safeDist;
  const meanTempC = weightedTempSum / safeDist;
  const detourPercent = ((optimalDistanceKm - directDistanceKm) / directDistanceKm) * 100;

  // Detect prioritized Rover/Lander encounters along the computed path
  const roverThresholdKm = clamp(directDistanceKm * 0.24, 240, 620);
  const roverEncounters: RoverEncounter[] = [];

  for (const rover of rovers) {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < waypoints.length; i++) {
      const d = marsGeodesicKm(
        waypoints[i].latDeg,
        waypoints[i].lonDeg,
        rover.latitude,
        rover.longitude
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestDist <= roverThresholdKm) {
      // Approximate corridor detour contribution around closest waypoint
      const prevIdx = Math.max(0, bestIdx - 2);
      const nextIdx = Math.min(waypoints.length - 1, bestIdx + 2);
      const dSpan = marsGeodesicKm(
        waypoints[prevIdx].latDeg,
        waypoints[prevIdx].lonDeg,
        waypoints[nextIdx].latDeg,
        waypoints[nextIdx].lonDeg
      );
      const dVia =
        marsGeodesicKm(
          waypoints[prevIdx].latDeg,
          waypoints[prevIdx].lonDeg,
          rover.latitude,
          rover.longitude
        ) +
        marsGeodesicKm(
          rover.latitude,
          rover.longitude,
          waypoints[nextIdx].latDeg,
          waypoints[nextIdx].lonDeg
        );
      const detourKm = Math.max(0, Math.round(dVia - dSpan));
      const isNuclear = rover.id === 'perseverance' || rover.id === 'curiosity' || rover.id === 'viking-1';
      const supportNote = isNuclear
        ? 'RTG warmth, UHF relay & emergency supply cache'
        : 'Surface landmark beacon & hardware salvage point';

      roverEncounters.push({
        target: rover,
        closestKm: bestDist,
        detourKm,
        supportNote,
      });
    }
  }
  roverEncounters.sort((a, b) => a.closestKm - b.closestKm);

  // Detect Orbiter ground-track overflight intersections along the path
  const orbiterEncounters: OrbiterEncounter[] = [];
  for (const track of orbiterTracks) {
    let bestDist = Infinity;
    let crossLatDeg = 0;
    let crossLonDeg = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      for (let j = 0; j < track.points.length; j++) {
        const tp = track.points[j];
        const d = marsGeodesicKm(wp.latDeg, wp.lonDeg, tp.latDeg, tp.lonDeg);
        if (d < bestDist) {
          bestDist = d;
          crossLatDeg = wp.latDeg;
          crossLonDeg = wp.lonDeg;
        }
      }
    }

    if (bestDist <= 280) {
      orbiterEncounters.push({
        target: track.target,
        closestKm: bestDist,
        crossLatDeg,
        crossLonDeg,
      });
    }
  }
  orbiterEncounters.sort((a, b) => a.closestKm - b.closestKm);

  return {
    start,
    destination,
    waypoints,
    directArcPoints,
    optimalDistanceKm,
    directDistanceKm,
    detourPercent,
    avgRadiationMsVDay,
    peakRadiationMsVDay: peakRad,
    directPeakRadiationMsVDay: directPeakRad,
    meanTempC,
    maxElevationM,
    minElevationM,
    roverEncounters: roverEncounters.slice(0, 5),
    orbiterEncounters: orbiterEncounters.slice(0, 4),
  };
}
