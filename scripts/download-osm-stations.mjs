import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './lib/database.mjs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((v) => v.startsWith('--'))
    .map((v) => v.slice(2).split('=')),
);
const bbox = args.bbox ?? '8.0,76.0,14.0,81.5';
const regionCode = (args.region ?? 'SR').toUpperCase();
const output = path.resolve(args.output ?? `${projectRoot}/data/raw/osm-stations.json`);
if (!/^[-\d.]+,[-\d.]+,[-\d.]+,[-\d.]+$/.test(bbox)) throw new Error('bbox must be south,west,north,east');
const query = `[out:json][timeout:90];node[railway=station][ref](${bbox});out body;`;
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let osm, lastError;
for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'RailOps-ADB-educational-import/1.0',
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(100_000),
    });
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
    osm = await response.json();
    break;
  } catch (error) {
    lastError = error;
  }
}
if (!osm) throw lastError ?? new Error('No Overpass endpoint returned data');
const dataset = {
  sourceName: 'OPENSTREETMAP',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  sourceLicense: 'ODbL-1.0',
  regionCode,
  stations: osm.elements.map((node) => ({
    sourceId: `node/${node.id}`,
    code: node.tags.ref,
    name: node.tags.name ?? node.tags.ref,
    latitude: node.lat,
    longitude: node.lon,
    state: node.tags['addr:state'],
  })),
  routes: [],
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(dataset, null, 2));
console.log(`Wrote ${dataset.stations.length} attributed station records to ${output}`);
