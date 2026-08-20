// Real Road Routing Utility using Free Open Source Routing Machine (OSRM)
// Matches Google Maps-style driving road network paths with 100% free open-access API.

export interface RealRoadRouteResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  isRealRoad: boolean;
}

// Haversine direct distance in meters
export function calculateDirectDistanceMeters(coords: [number, number][]): number {
  if (!coords || coords.length < 2) return 0;
  let totalKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const R = 6371; // km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalKm += R * c;
  }
  return Math.round(totalKm * 1000);
}

// Chaikin polyline corner smoothing for fallback
function smoothCoordinates(coords: [number, number][], iterations = 2): [number, number][] {
  if (!coords || coords.length <= 2) return coords;
  let current = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: [number, number][] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      const q: [number, number] = [
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1]
      ];
      const r: [number, number] = [
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1]
      ];
      smoothed.push(q, r);
    }
    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }
  return current;
}

/**
 * Fetch real-world road network route between waypoints using Free OSRM Public API.
 * Free, No API key required, 100% accurate road geometry and meter distance.
 */
export async function fetchRealRoadRoute(
  waypoints: [number, number][]
): Promise<RealRoadRouteResult> {
  if (!waypoints || waypoints.length < 2) {
    return {
      coordinates: waypoints || [],
      distanceMeters: 0,
      durationSeconds: 0,
      isRealRoad: false
    };
  }

  try {
    const coordsQuery = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const primaryRoute = data.routes[0];
        const routeCoords = primaryRoute.geometry.coordinates as [number, number][];
        const distanceMeters = Math.round(primaryRoute.distance);
        const durationSeconds = Math.round(primaryRoute.duration || 0);

        return {
          coordinates: routeCoords,
          distanceMeters,
          durationSeconds,
          isRealRoad: true
        };
      }
    }
  } catch {
    // Network or timeout error — proceed to smooth fallback
  }

  // Robust fallback: smoothed interpolation with direct distance calculation
  const smoothedFallback = smoothCoordinates(waypoints, 2);
  const directMeters = calculateDirectDistanceMeters(waypoints);

  return {
    coordinates: smoothedFallback,
    distanceMeters: directMeters,
    durationSeconds: Math.round(directMeters / 10), // estimate ~36 km/h
    isRealRoad: false
  };
}
