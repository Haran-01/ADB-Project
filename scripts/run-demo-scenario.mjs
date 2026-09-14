import { loadEnv } from './lib/database.mjs';

const definitions = {
  'track-failure': {
    type: 'TRACK_FAILURE',
    severity: 'CRITICAL',
    target: 'track_id',
    description: 'Demo: signal-linked track failure requiring immediate rerouting.',
  },
  'station-closure': {
    type: 'STATION_CLOSURE',
    severity: 'HIGH',
    target: 'station_id',
    description: 'Demo: temporary station closure affecting scheduled movements.',
  },
  maintenance: {
    type: 'MAINTENANCE',
    severity: 'MEDIUM',
    target: 'track_id',
    description: 'Demo: planned maintenance block with controlled delay exposure.',
  },
};

export function scenarioDefinition(name) {
  const definition = definitions[name];
  if (!definition) throw new Error(`Unknown scenario "${name}". Use ${Object.keys(definitions).join(', ')}.`);
  return definition;
}

async function request(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `API request failed (${response.status})`);
  return body;
}

export async function runDemoScenario({ name, baseUrl, token }) {
  const definition = scenarioDefinition(name);
  const resource = definition.target === 'station_id' ? 'stations' : 'tracks';
  const { data: targets } = await request(baseUrl, token, `/${resource}?limit=200`);
  const available = targets.filter((item) => definition.target === 'station_id' || item.status === 'ACTIVE');
  if (!available.length) throw new Error(`No available ${resource} target was returned by the API`);

  let conflict;
  for (const target of available) {
    const targetId = definition.target === 'station_id' ? target.id : target.track_id;
    try {
      return await request(baseUrl, token, '/disruptions', {
        method: 'POST',
        body: JSON.stringify({
          type: definition.type,
          severity: definition.severity,
          description: definition.description,
          [definition.target]: targetId,
        }),
      });
    } catch (error) {
      if (!/active disruption|conflict/i.test(error.message)) throw error;
      conflict = error;
    }
  }
  throw conflict ?? new Error('No eligible scenario target could be found');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--apply'))
    throw new Error('Use --apply to create a demo disruption through the running API.');
  const name = process.argv.find((value) => value.startsWith('--type='))?.split('=')[1] ?? 'track-failure';
  const env = loadEnv();
  const baseUrl = (env.API_BASE_URL ?? 'http://127.0.0.1:4000/api').replace(/\/$/, '');
  const result = await runDemoScenario({ name, baseUrl, token: env.API_TOKEN });
  console.log(JSON.stringify(result, null, 2));
}
