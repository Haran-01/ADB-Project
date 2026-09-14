import { GeoJSON, MapContainer, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { EmptyState, ErrorState, LoadingState } from './UI.jsx';
import { useMap } from 'react-leaflet';

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
  const labelStation = ['MAS', 'CGL', 'VM', 'SA', 'TPJ', 'MDU', 'NCJ', 'SBC', 'CBE', 'BPL', 'NDLS'].includes(
    p.station_code,
  );
  layer.bindTooltip(text, {
    sticky: !labelStation,
    permanent: labelStation,
    direction: 'right',
    className: labelStation ? 'station-label' : 'map-tooltip',
  });
  if (labelStation) {
    const fullName = text.textContent;
    text.textContent = p.station_code;
    layer.on('mouseover', () => {
      text.textContent = fullName;
    });
    layer.on('mouseout', () => {
      text.textContent = p.station_code;
    });
    const popup = document.createElement('span');
    popup.textContent = fullName;
    layer.bindPopup(popup);
  }
}
export function NetworkMap({ query }) {
  if (query.isLoading) return <LoadingState label="Drawing railway network" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data?.features?.length) return <EmptyState title="No network geometry" />;
  return (
    <MapContainer className="network-map" bounds={bounds} zoomControl={false} attributionControl={false}>
      <ZoomControl position="bottomright" />
      <MapControls data={query.data} />
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
function MapControls({ data }) {
  const map = useMap();
  return (
    <div className="map-tools">
      <button onClick={() => map.fitBounds(bounds)}>Southern region</button>
      <button
        onClick={() => {
          const points = data.features
            .filter((f) => f.geometry?.type === 'Point')
            .map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
          if (points.length) map.fitBounds(points, { padding: [35, 35] });
        }}
      >
        Full network
      </button>
    </div>
  );
}
