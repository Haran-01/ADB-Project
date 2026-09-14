-- Separate transaction: newly added enum values become usable after commit.
alter type railway_main.event_type add value if not exists 'TRAIN_AFFECTED';
alter type railway_main.event_type add value if not exists 'JOURNEY_STATUS_CHANGED';
alter type railway_main.event_type add value if not exists 'NETWORK_CHANGED';
