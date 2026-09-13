-- Phase 3 migration: core relational and spatial indexes.

create index if not exists idx_stations_region_id on railway_main.stations(region_id);
create index if not exists idx_stations_status on railway_main.stations(status);

create index if not exists idx_tracks_from_station_id on railway_main.tracks(from_station_id);
create index if not exists idx_tracks_to_station_id on railway_main.tracks(to_station_id);
create index if not exists idx_tracks_region_id on railway_main.tracks(region_id);
create index if not exists idx_tracks_status on railway_main.tracks(status);
create index if not exists idx_tracks_valid_window on railway_main.tracks(valid_from, valid_to);

create index if not exists idx_trains_source_station_id on railway_main.trains(source_station_id);
create index if not exists idx_trains_destination_station_id on railway_main.trains(destination_station_id);
create index if not exists idx_trains_status on railway_main.trains(status);

create index if not exists idx_train_schedules_train_id on railway_main.train_schedules(train_id);
create index if not exists idx_train_schedules_station_id on railway_main.train_schedules(station_id);

create index if not exists idx_train_journeys_train_id on railway_main.train_journeys(train_id);
create index if not exists idx_train_journeys_current_station_id on railway_main.train_journeys(current_station_id);
create index if not exists idx_train_journeys_next_station_id on railway_main.train_journeys(next_station_id);
create index if not exists idx_train_journeys_status_date on railway_main.train_journeys(journey_status, journey_date);

create index if not exists idx_disruptions_track_id on railway_main.disruptions(track_id);
create index if not exists idx_disruptions_station_id on railway_main.disruptions(station_id);
create index if not exists idx_disruptions_status_started_at on railway_main.disruptions(status, started_at);

create index if not exists idx_affected_trains_disruption_id on railway_main.affected_trains(disruption_id);
create index if not exists idx_affected_trains_train_journey_id on railway_main.affected_trains(train_journey_id);

create index if not exists idx_route_recommendations_disruption_id on railway_main.route_recommendations(disruption_id);
create index if not exists idx_route_recommendations_train_journey_id on railway_main.route_recommendations(train_journey_id);
create index if not exists idx_route_recommendations_status on railway_main.route_recommendations(status);

create index if not exists idx_event_log_status_created_at on railway_main.event_log(status, created_at);
create index if not exists idx_event_log_event_type on railway_main.event_log(event_type);

create index if not exists idx_track_status_history_track_changed on railway_main.track_status_history(track_id, changed_at);
create index if not exists idx_train_status_history_train_changed on railway_main.train_status_history(train_id, changed_at);
create index if not exists idx_journey_delay_history_journey_changed on railway_main.journey_delay_history(train_journey_id, changed_at);
create index if not exists idx_disruption_history_disruption_changed on railway_main.disruption_history(disruption_id, changed_at);

create index if not exists idx_stations_geom_gist on railway_main.stations using gist (geom);
create index if not exists idx_tracks_geom_gist on railway_main.tracks using gist (geom);
create index if not exists idx_disruptions_geom_gist on railway_main.disruptions using gist (geom);

