begin;

alter table public.trip_requests
  add column detour_km double precision,
  drop constraint trip_requests_check1,
  add constraint trip_requests_driver_offer_check check (
    (role = 'DRIVER' and vehicle_available and seats is not null and seats between 1 and 3
      and (
        (detour_minutes is not null and detour_minutes between 0 and 120 and detour_km is null)
        or (detour_minutes is null and detour_km is not null and detour_km >= 0 and detour_km < 'Infinity'::float8)
      ))
    or (role = 'PASSENGER' and not vehicle_available and seats is null and detour_minutes is null and detour_km is null)
  );

create or replace function public.register_carpool(
  p_event uuid, p_participant uuid, p_name text, p_contact text, p_consent boolean, p_trips jsonb, p_demo boolean
) returns void
language plpgsql set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  trip jsonb;
  trip_id uuid;
begin
  select * into event_row from public.events where id = p_event for update;
  if not found then raise exception 'event_missing'; end if;
  if p_demo is distinct from event_row.is_demo then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.participants where event_id = p_event and id = p_participant) then return; end if;
  if (not p_demo and (not event_row.registration_open or event_row.registration_deadline <= now())) then
    raise exception 'registration_closed';
  end if;
  if jsonb_array_length(p_trips) not between 1 and 2 then raise exception 'invalid_trips'; end if;

  insert into public.participants(id, event_id, display_name, contact_value, consent_given)
  values (p_participant, p_event, p_name, p_contact, p_consent);
  for trip in select value from jsonb_array_elements(p_trips) loop
    trip_id := (trip->>'id')::uuid;
    insert into public.trip_requests(id, event_id, participant_id, leg, role, location,
      earliest_at, latest_at, seats, detour_minutes, detour_km, vehicle_available)
    values (trip_id, p_event, p_participant, (trip->>'leg')::public.carpool_leg, (trip->>'role')::public.carpool_role,
      trip->'location', (trip->>'earliest_at')::timestamptz, (trip->>'latest_at')::timestamptz,
      (trip->>'seats')::integer, (trip->>'detour_minutes')::integer, (trip->>'detour_km')::double precision,
      (trip->>'vehicle_available')::boolean);
    insert into public.access_tokens(token_hash, trip_request_id) values (trip->>'token_hash', trip_id);
  end loop;
  update public.events set revision = revision + 1 where id = p_event;
end;
$$;

commit;
