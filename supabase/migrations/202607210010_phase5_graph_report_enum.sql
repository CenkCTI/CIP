-- Add REPORT as a graph entity type in a separate migration for PostgreSQL enum safety.
alter type public.graph_entity_type add value if not exists 'REPORT';
