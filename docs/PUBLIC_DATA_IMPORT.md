# Phase 16 — Public dataset import

The importer augments the handcrafted fallback dataset and keeps PostgreSQL authoritative. Migration 009 records source provenance on stations/tracks plus immutable batch checksums and per-record rejection details.

OpenStreetMap is the selected station source. Data is © OpenStreetMap contributors under the Open Database License 1.0. Attribution and license terms: https://www.openstreetmap.org/copyright. Geofabrik also publishes current India extracts at https://download.geofabrik.de/asia/india.html for larger offline processing.

Download coded railway stations for a bounded area through Overpass:

```bash
node scripts/download-osm-stations.mjs \
  --bbox=8.0,76.0,14.0,81.5 \
  --region=SR \
  --output=data/raw/osm-stations.json
node scripts/import-public-data.mjs --file data/raw/osm-stations.json --apply
npm run graph:sync
npm run validate:db
```

`data/raw` is ignored because public snapshots can be large and must retain their ODbL terms. The downloader includes source URL, license and OSM node IDs. Only stations carrying a `ref` are downloaded; codes are uppercased and stripped to A–Z/0–9. Invalid records are recorded in `import_rejections` without aborting valid rows.

The normalized JSON format also accepts `routes`. Each route provides a public source ID, train number/name/type/priority, speed, and ordered station-code stops. The importer maps every stop to an existing station, creates both directed graph edges from consecutive stops, calculates a 1.1× geodesic operating-distance approximation when surveyed railway length is unavailable, and replaces schedules only when no journey references the train. Unknown-stop routes are rejected. Repeating the same content returns the completed batch by SHA-256 checksum instead of duplicating data.

Example route object:

```json
{
  "sourceId": "provider-route-42",
  "trainNumber": "P42",
  "name": "Provider route 42",
  "trainType": "PASSENGER",
  "priority": 5,
  "speedLimitKmph": 90,
  "stops": ["MAS", "AJJ", "KPD"]
}
```

Timetable data must be imported only when its license permits reuse; record its exact URL and license in the dataset envelope. Do not label inferred routes as official schedules. The included test fixture is synthetic and verifies normalization, rejection tracking, graph-edge creation and checksum idempotency; it is not presented as real railway data.
