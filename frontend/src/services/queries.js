import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export const keys = {
  health: ['health'],
  stations: ['stations'],
  tracks: ['tracks'],
  trains: ['trains'],
  journeys: ['journeys'],
  disruptions: ['disruptions'],
  events: ['events'],
  map: ['map'],
  affected: (id) => ['affected', id],
  recommendations: (id) => ['recommendations', id],
};
export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 30_000 });
export const useStations = () => useQuery({ queryKey: keys.stations, queryFn: api.stations });
export const useTracks = () => useQuery({ queryKey: keys.tracks, queryFn: api.tracks });
export const useTrains = () => useQuery({ queryKey: keys.trains, queryFn: api.trains });
export const useJourneys = () => useQuery({ queryKey: keys.journeys, queryFn: api.journeys });
export const useDisruptions = () =>
  useQuery({ queryKey: keys.disruptions, queryFn: api.disruptions, refetchInterval: 5000 });
export const useProgress = (id) =>
  useQuery({
    queryKey: ['progress', id],
    queryFn: () => api.progress(id),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.disruption?.analysis_status === 'COMPLETED' ? 15000 : 1500,
  });
export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: api.events });
export const useNetworkMap = () => useQuery({ queryKey: keys.map, queryFn: api.map });
export const useAffected = (id) =>
  useQuery({
    queryKey: keys.affected(id),
    queryFn: () => api.affected(id),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
export const useRecommendations = (id) =>
  useQuery({
    queryKey: keys.recommendations(id),
    queryFn: () => api.recommendations(id),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });

const invalidateOperations = (client) =>
  Promise.all([
    client.invalidateQueries({ queryKey: keys.disruptions }),
    client.invalidateQueries({ queryKey: keys.events }),
    client.invalidateQueries({ queryKey: keys.journeys }),
    client.invalidateQueries({ queryKey: keys.map }),
  ]);
export function useCreateDisruption() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.createDisruption, onSuccess: () => invalidateOperations(client) });
}
export function useApplyRecommendation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.applyRecommendation,
    onSuccess: (result) =>
      Promise.all([
        invalidateOperations(client),
        client.invalidateQueries({ queryKey: keys.recommendations(result.data.disruption_id) }),
        client.invalidateQueries({ queryKey: keys.affected(result.data.disruption_id) }),
      ]),
  });
}
