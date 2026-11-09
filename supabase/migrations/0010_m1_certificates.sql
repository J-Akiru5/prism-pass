-- M3 certificate generation provenance.
--
-- Strictly additive and idempotent: three nullable columns, one unique index
-- and one ordinary index. No renames, no drops of live columns, no data
-- rewrite. Generic documents created before this migration keep working: their
-- source columns stay null, and Postgres treats nulls as distinct in a unique
-- index, so any number of non-generated documents may coexist.
--
-- The unique key is the hard backstop for idempotent generation: a repeated
-- POST /sessions/:sessionId/certificates can only ever create one document per
-- (organization_id, source_session_id, source_person_id). The API still counts
-- existing keys before inserting so a repeat is a normal response, not an error.
--
-- Rollback (development only, never production):
--   drop index if exists documents_org_batch_idx;
--   drop index if exists documents_org_source_person_key;
--   alter table documents drop column if exists batch_id;
--   alter table documents drop column if exists source_person_id;
--   alter table documents drop column if exists source_session_id;
--
-- RLS is unchanged from 0007_documents.sql: documents remains deny-by-default
-- (no policies, no anon/authenticated privileges). The server uses the service
-- role only after requireOrganizationPermission().

alter table documents add column if not exists source_session_id text;
alter table documents add column if not exists source_person_id text;
alter table documents add column if not exists batch_id text;

-- One certificate per attendee per event. A full (not partial) unique index is
-- deliberate: it matches Prisma's @@unique([organizationId, sourceSessionId,
-- sourcePersonId]) and still allows unlimited null-source documents.
create unique index if not exists documents_org_source_person_key
  on documents (organization_id, source_session_id, source_person_id);

-- Batch lookup for the organizer list ("what did this generate run create?").
create index if not exists documents_org_batch_idx
  on documents (organization_id, batch_id);
