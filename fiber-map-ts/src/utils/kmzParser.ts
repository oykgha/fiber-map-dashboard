import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';

export async function parseKmzToGeoJson(url: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    let kmlText: string;
    try {
      // KMZ is just a zipped KML. Find the main .kml file.
      const zip = await JSZip.loadAsync(blob);
      const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
      if (!kmlFile) {
        console.error('No .kml file found in KMZ archive.');
        return null;
      }
      kmlText = await kmlFile.async('text');
    } catch {
      // Not a zip archive — treat as a plain, unzipped .kml file instead.
      kmlText = await blob.text();
    }

    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
    
    const geoJson = kml(kmlDoc) as GeoJSON.FeatureCollection;
    
    // Flatten GeometryCollections so MapLibre and filters can read Points and LineStrings
    const flattenedFeatures: GeoJSON.Feature[] = [];
    geoJson.features.forEach(f => {
      if (f.geometry?.type === 'GeometryCollection') {
        f.geometry.geometries.forEach(geom => {
          flattenedFeatures.push({
            type: 'Feature',
            properties: f.properties,
            geometry: geom
          });
        });
      } else {
        flattenedFeatures.push(f as GeoJSON.Feature);
      }
    });
    
    return {
      type: 'FeatureCollection',
      features: flattenedFeatures
    };
  } catch (error) {
    console.error('Error parsing KMZ:', error);
    return null;
  }
}
