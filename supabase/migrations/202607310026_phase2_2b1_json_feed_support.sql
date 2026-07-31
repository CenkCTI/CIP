-- Phase 2.2B.1: additive JSON Feed type support. PostgreSQL 16 permits the
-- enum value to be used by subsequent transactions after this migration commits.
alter type public.research_feed_type add value if not exists 'JSON_FEED' after 'ATOM';
