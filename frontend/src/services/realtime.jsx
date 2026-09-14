import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from './queries.js';
import { socketConfig } from './api.js';

const Context = createContext({ connected: false, lastEvent: null });
const eventNames = [
  'disruption.created',
  'disruption.analysis_started',
  'disruption.analysis_completed',
  'train.affected',
  'route.recommended',
  'train.status_updated',
];
export function RealtimeProvider({ children }) {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  useEffect(() => {
    const socket = io(socketConfig.url, socketConfig.options);
    socket.on('connect', () => {
      setConnected(true);
      client.invalidateQueries();
    });
    socket.on('disconnect', () => setConnected(false));
    for (const eventName of eventNames)
      socket.on(eventName, (payload) => {
        setLastEvent({ eventName, payload, receivedAt: new Date().toISOString() });
        client.invalidateQueries({ queryKey: keys.disruptions });
        client.invalidateQueries({ queryKey: keys.events });
        client.invalidateQueries({ queryKey: keys.journeys });
        client.invalidateQueries({ queryKey: keys.map });
        client.invalidateQueries({ queryKey: keys.tracks });
        client.invalidateQueries({ queryKey: keys.stations });
        client.invalidateQueries({ queryKey: ['progress'] });
        if (payload.disruption_id) {
          client.invalidateQueries({ queryKey: keys.affected(payload.disruption_id) });
          client.invalidateQueries({ queryKey: keys.recommendations(payload.disruption_id) });
        }
      });
    return () => socket.disconnect();
  }, [client]);
  const value = useMemo(() => ({ connected, lastEvent }), [connected, lastEvent]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useRealtime = () => useContext(Context);
