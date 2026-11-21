begin;

create table public.registration_access_tokens (
  event_id uuid not null,
  participant_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  primary key (event_id, participant_id),
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade
);

alter table public.registration_access_tokens enable row level security;
revoke all on public.registration_access_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.registration_access_tokens to service_role;

create function public.register_carpool_with_receipt(
  p_event uuid, p_participant uuid, p_name text, p_contact text, p_consent boolean, p_trips jsonb, p_receipt_hash text
) returns void
language plpgsql set search_path = ''
as $$
begin
  perform public.register_carpool(p_event, p_participant, p_name, p_contact, p_consent, p_trips, false);
  insert into public.registration_access_tokens(event_id, participant_id, token_hash)
  values (p_event, p_participant, p_receipt_hash)
  on conflict (event_id, participant_id) do nothing;

  if not exists (
    select 1 from public.registration_access_tokens
    where event_id = p_event and participant_id = p_participant and token_hash = p_receipt_hash
  ) then raise exception 'registration_receipt_mismatch'; end if;
end;
$$;

create function public.read_carpool_registration(p_hash text) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'eventId', e.id,
    'eventToken', e.public_token,
    'eventName', e.name,
    'guestName', p.display_name,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object('tripId', t.id, 'ride', public.read_carpool_ride(k.token_hash)) order by t.leg)
      from public.trip_requests t join public.access_tokens k on k.trip_request_id = t.id
      where t.event_id = r.event_id and t.participant_id = r.participant_id
    ), '[]')
  )
  from public.registration_access_tokens r
  join public.participants p on p.id = r.participant_id and p.event_id = r.event_id
  join public.events e on e.id = r.event_id
  where r.token_hash = p_hash;
$$;

revoke all on function
  public.register_carpool_with_receipt(uuid, uuid, text, text, boolean, jsonb, text), public.read_carpool_registration(text)
from public, anon, authenticated;
grant execute on function
  public.register_carpool_with_receipt(uuid, uuid, text, text, boolean, jsonb, text), public.read_carpool_registration(text)
to service_role;

create or replace function public.organizer_workspace(p_event uuid, p_owner uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'participants', coalesce((
      select jsonb_agg(to_jsonb(p) || jsonb_build_object('has_my_ride', exists (
        select 1 from public.registration_access_tokens k where k.event_id = e.id and k.participant_id = p.id
      )) order by p.created_at, p.id) from public.participants p where p.event_id = e.id
    ), '[]'),
    'trips', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.trip_requests t where t.event_id = e.id), '[]'),
    'runs', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id)
      from public.match_runs r where r.event_id = e.id and r.status <> 'SUPERSEDED'
    ), '[]'),
    'history', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id)
      from (select id, leg, status, created_at from public.match_runs where event_id = e.id
        order by created_at desc, id limit 12) r
    ), '[]'),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('rider_ids', (
        select jsonb_agg(ar.passenger_trip_request_id order by ar.stop_order)
        from public.assignment_riders ar where ar.assignment_id = a.id
      ), 'rider_details', (
        select jsonb_agg(jsonb_build_object('id', ar.passenger_trip_request_id, 'location', ar.coordination_location,
          'shift_minutes', ar.coordination_shift_minutes) order by ar.stop_order)
        from public.assignment_riders ar where ar.assignment_id = a.id
      )) order by a.driver_trip_request_id)
      from public.assignments a join public.match_runs r on r.id = a.match_run_id
      where a.event_id = e.id and r.status <> 'SUPERSEDED'
    ), '[]'),
    'declined_driver_ids', coalesce((
      select jsonb_agg(distinct a.driver_trip_request_id) from public.assignments a
      where a.event_id = e.id and a.status = 'DECLINED'
    ), '[]')
  ) from public.events e where e.id = p_event and e.organizer_id = p_owner;
$$;

commit;
