import { GeoJSON, MapContainer, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { EmptyState, ErrorState, LoadingState } from './UI.jsx';

const bounds = [
  [7.6, 76.3],
  [14.1, 81.2],
];
const trackColor = { ACTIVE: '#5de7b5', FAILED: '#ff675e', BLOCKED: '#ff675e', MAINTENANCE: '#ffbd5a' };
function style(feature) {
  if (feature.properties.kind === 'station') return {};
  return {
    color: trackColor[feature.properties.status] ?? '#82928e',
    weight: feature.properties.status === 'FAILED' ? 5 : 2.5,
    opacity: 0.82,
  };
}
function pointToLayer(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: feature.properties.status === 'ACTIVE' ? 5 : 7,
    fillColor: feature.properties.status === 'ACTIVE' ? '#f4f7e7' : '#ff675e',
    color: '#07110f',
    weight: 2,
    fillOpacity: 1,
  });
}
function onEachFeature(feature, layer) {
  const p = feature.properties;
  const text = document.createElement('span');
  text.textContent =
    p.kind === 'station' ? `${p.station_code} · ${p.name}` : `${p.status} · ${p.distance_km} km`;
  layer.bindTooltip(text, { sticky: true, className: 'map-tooltip' });
}
export function NetworkMap({ query }) {
  if (query.isLoading) return <LoadingState label="Drawing railway network" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data?.features?.length) return <EmptyState title="No network geometry" />;
  return (
    <MapContainer className="network-map" bounds={bounds} zoomControl={false} attributionControl={false}>
      <ZoomControl position="bottomright" />
      <GeoJSON
        key={query.data.features.map((f) => `${f.id}:${f.properties.status}`).join('|')}
        data={query.data}
        style={style}
        pointToLayer={pointToLayer}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}
