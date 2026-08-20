import fs from 'fs';
import JSZip from 'jszip';
import { DOMParser } from 'xmldom';
import { kml } from '@tmcw/togeojson';

async function test() {
  const data = fs.readFileSync('public/DWD.kmz');
  const zip = await JSZip.loadAsync(data);
  const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
  const kmlText = await kmlFile.async('text');
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
  const geoJson = kml(kmlDoc);
  
  const flattenedFeatures = [];
  geoJson.features.forEach(f => {
    if (f.geometry?.type === 'GeometryCollection') {
      f.geometry.geometries.forEach(geom => {
        flattenedFeatures.push({ type: 'Feature', properties: f.properties, geometry: geom });
      });
    } else {
      flattenedFeatures.push(f);
    }
  });
  
  const types = {};
  flattenedFeatures.forEach(f => {
    types[f.geometry?.type] = (types[f.geometry?.type] || 0) + 1;
  });
  console.log('Flattened Feature types found:', types);
}
test();
