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
  const geojson = kml(kmlDoc);
  
  const types = {};
  geojson.features.forEach(f => {
    types[f.geometry?.type] = (types[f.geometry?.type] || 0) + 1;
  });
  console.log('Feature types found:', types);
  if (geojson.features.length > 0) {
    console.log('First feature:', JSON.stringify(geojson.features[0]).substring(0, 200));
  }
}
test();
