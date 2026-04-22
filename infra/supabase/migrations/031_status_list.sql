-- Migration 031: StatusList2021 credential revocation
-- Stores the compressed bitstring per W3C VC StatusList2021 spec.
-- Each credential is assigned a sequential status_list_index at issuance.

-- StatusList storage: one row per list (usually just "default")
create table status_lists (
  id text primary key,                  -- e.g. 'default'
  purpose text not null default 'revocation',
  encoded_list text not null,           -- base64url(gzip(131072-bit bitstring))
  signed_vc_json jsonb,                 -- cached signed StatusList2021 VC
  updated_at timestamptz default now()
);

-- Sequential index per credential so we know which bit to flip on revocation
alter table credentials
  add column if not exists status_list_id text references status_lists(id)
    default 'default',
  add column if not exists status_list_index integer;

-- Sequence for assigning monotonically-increasing indices
create sequence if not exists credential_status_index_seq;
