begin;

create type public.carpool_leg as enum ('TO_EVENT', 'FROM_EVENT');
create type public.carpool_role as enum ('DRIVER', 'PASSENGER');
create type public.carpool_run_status as enum ('PROPOSED', 'APPROVED', 'SUPERSEDED');
create type public.carpool_assignment_status as enum ('PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  public_token text not null unique check (public_token ~ '^[a-f0-9]{48}$'),
  name text not null,
  organization_name text,
  description text,
  venue jsonb not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  registration_deadline timestamptz not null,
  hubs jsonb not null default '[]',
  registration_open boolean not null default true,
  is_demo boolean not null default false,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and registration_deadline <= starts_at)
);
create index events_organizer_idx on public.events (organizer_id, created_at desc);

create table public.participants (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  display_name text not null,
  contact_value text,
  consent_given boolean not null check (consent_given),
  created_at timestamptz not null default now(),
  unique (event_id, id)
);

create table public.trip_requests (
  id uuid primary key,
  event_id uuid not null,
  participant_id uuid not null,
  leg public.carpool_leg not null,
  role public.carpool_role not null,
  location jsonb not null,
  earliest_at timestamptz not null,
  latest_at timestamptz,
  seats integer,
  detour_minutes integer,
  vehicle_available boolean not null,
  created_at timestamptz not null default now(),
  foreign key (event_id, participant_id) references public.participants(event_id, id) on delete cascade,
  unique (participant_id, leg),
  unique (event_id, leg, role, id),
  check (latest_at is null or latest_at >= earliest_at),
  check (
    (role = 'DRIVER' and vehicle_available and seats is not null and seats between 1 and 3
      and detour_minutes is not null and detour_minutes between 0 and 120)
    or (role = 'PASSENGER' and not vehicle_available and seats is null and detour_minutes is null)
  )
);
create index trip_event_idx on public.trip_requests (event_id, leg);

create table public.access_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  trip_request_id uuid not null unique references public.trip_requests(id) on delete cascade
);

create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  leg public.carpool_leg not null,
  solver_version text not null,
  revision integer not null,
  status public.carpool_run_status not null default 'PROPOSED',
  unmatched_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique (id, event_id, leg)
);
create unique index match_current_per_leg on public.match_runs (event_id, leg, status)
  where status in ('PROPOSED', 'APPROVED');
create index match_event_history on public.match_runs (event_id, created_at desc);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid not null,
  event_id uuid not null,
  leg public.carpool_leg not null,
  driver_trip_request_id uuid not null,
  driver_role public.carpool_role generated always as ('DRIVER'::public.carpool_role) stored,
  extra_km double precision not null check (extra_km >= 0 and extra_km < 'Infinity'::float8),
  departure_at timestamptz not null,
  status public.carpool_assignment_status not null default 'PROPOSED',
  responded_at timestamptz,
  foreign key (match_run_id, event_id, leg) references public.match_runs(id, event_id, leg) on delete cascade,
  foreign key (event_id, leg, driver_role, driver_trip_request_id) references public.trip_requests(event_id, leg, role, id) on delete cascade,
  unique (match_run_id, driver_trip_request_id),
  unique (id, match_run_id, event_id, leg)
);
create index assignment_event_status_idx on public.assignments (event_id, status);

create table public.assignment_riders (
  assignment_id uuid not null,
  match_run_id uuid not null,
  event_id uuid not null,
  leg public.carpool_leg not null,
  passenger_trip_request_id uuid not null,
  passenger_role public.carpool_role generated always as ('PASSENGER'::public.carpool_role) stored,
  stop_order smallint not null check (stop_order between 1 and 3),
  primary key (assignment_id, stop_order),
  unique (match_run_id, passenger_trip_request_id),
  foreign key (assignment_id, match_run_id, event_id, leg)
    references public.assignments(id, match_run_id, event_id, leg) on delete cascade,
  foreign key (event_id, leg, passenger_role, passenger_trip_request_id)
    references public.trip_requests(event_id, leg, role, id) on delete cascade
);

alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.trip_requests enable row level security;
alter table public.access_tokens enable row level security;
alter table public.match_runs enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_riders enable row level security;

revoke all on public.events, public.participants, public.trip_requests, public.access_tokens,
  public.match_runs, public.assignments, public.assignment_riders from public, anon, authenticated;
grant select, insert, update, delete on public.events, public.participants, public.trip_requests, public.access_tokens,
  public.match_runs, public.assignments, public.assignment_riders to service_role;

create function public.register_carpool(
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
      earliest_at, latest_at, seats, detour_minutes, vehicle_available)
    values (trip_id, p_event, p_participant, (trip->>'leg')::public.carpool_leg, (trip->>'role')::public.carpool_role,
      trip->'location', (trip->>'earliest_at')::timestamptz, (trip->>'latest_at')::timestamptz,
      (trip->>'seats')::integer, (trip->>'detour_minutes')::integer, (trip->>'vehicle_available')::boolean);
    insert into public.access_tokens(token_hash, trip_request_id) values (trip->>'token_hash', trip_id);
  end loop;
  update public.events set revision = revision + 1 where id = p_event;
end;
$$;

create function public.create_carpool_event(p_owner uuid, p_event jsonb, p_fixtures jsonb) returns uuid
language plpgsql set search_path = ''
as $$
declare
  new_id uuid;
  fixture jsonb;
  is_demo boolean := jsonb_array_length(p_fixtures) > 0;
begin
  insert into public.events(organizer_id, public_token, name, organization_name, description, venue, starts_at, ends_at,
    timezone, registration_deadline, hubs, is_demo)
  values(p_owner, p_event->>'public_token', p_event->>'name', p_event->>'organization_name', p_event->>'description',
    p_event->'venue', (p_event->>'starts_at')::timestamptz, (p_event->>'ends_at')::timestamptz,
    p_event->>'timezone', (p_event->>'registration_deadline')::timestamptz, p_event->'hubs', is_demo)
  returning id into new_id;
  for fixture in select value from jsonb_array_elements(p_fixtures) loop
    perform public.register_carpool(new_id, (fixture->>'id')::uuid, fixture->>'name', fixture->>'contact', true, fixture->'trips', true);
  end loop;
  return new_id;
end;
$$;

create function public.organizer_workspace(p_event uuid, p_owner uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'event', to_jsonb(e),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at, p.id) from public.participants p where p.event_id = e.id), '[]'),
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

create function public.save_carpool_run(
  p_event uuid, p_owner uuid, p_leg public.carpool_leg, p_revision integer, p_solver text, p_unmatched uuid[], p_routes jsonb
) returns uuid
language plpgsql set search_path = ''
as $$
declare
  current_revision integer;
  run_id uuid;
  assignment_id uuid;
  driver_id uuid;
  driver_seats integer;
  route jsonb;
begin
  select revision into current_revision from public.events where id = p_event and organizer_id = p_owner for update;
  if not found then raise exception 'event_missing'; end if;
  if current_revision <> p_revision then raise exception 'stale_run'; end if;
  update public.match_runs set status = 'SUPERSEDED'
    where event_id = p_event and leg = p_leg and status = 'PROPOSED';
  insert into public.match_runs(event_id, leg, solver_version, revision, unmatched_ids)
  values (p_event, p_leg, p_solver, p_revision, p_unmatched) returning id into run_id;

  for route in select value from jsonb_array_elements(p_routes) loop
    driver_id := (route->>'driverId')::uuid;
    select seats into driver_seats from public.trip_requests
      where event_id = p_event and leg = p_leg and id = driver_id and role = 'DRIVER';
    if not found or jsonb_array_length(route->'stops') not between 1 and driver_seats then
      raise exception 'invalid_capacity';
    end if;
    if exists (select 1 from public.assignments
      where event_id = p_event and driver_trip_request_id = driver_id and status = 'DECLINED') then
      raise exception 'driver_declined';
    end if;

    insert into public.assignments(match_run_id, event_id, leg, driver_trip_request_id, extra_km, departure_at)
    values(run_id, p_event, p_leg, driver_id, (route->>'extraKm')::float8, (route->>'departureIso')::timestamptz)
    returning id into assignment_id;
    insert into public.assignment_riders(assignment_id, match_run_id, event_id, leg, passenger_trip_request_id, stop_order)
      select assignment_id, run_id, p_event, p_leg, (stop->>'passengerId')::uuid, ordinality
      from jsonb_array_elements(route->'stops') with ordinality as s(stop, ordinality);
  end loop;
  return run_id;
end;
$$;

create function public.approve_carpool_run(p_event uuid, p_owner uuid, p_run uuid) returns void
language plpgsql set search_path = ''
as $$
declare
  current_revision integer;
  proposed public.match_runs%rowtype;
begin
  select revision into current_revision from public.events where id = p_event and organizer_id = p_owner for update;
  if not found then raise exception 'event_missing'; end if;
  select * into proposed from public.match_runs where id = p_run and event_id = p_event;
  if not found then raise exception 'run_missing'; end if;
  if proposed.status = 'APPROVED' then return; end if;
  if proposed.status <> 'PROPOSED' or proposed.revision <> current_revision then raise exception 'stale_run'; end if;
  update public.match_runs set status = 'SUPERSEDED'
    where event_id = p_event and leg = proposed.leg and status = 'APPROVED';
  update public.match_runs set status = 'APPROVED' where id = proposed.id;
end;
$$;

create function public.record_carpool_response(p_hash text, p_assignment uuid, p_response public.carpool_assignment_status)
returns void
language plpgsql set search_path = ''
as $$
declare
  trip public.trip_requests%rowtype;
  current_assignment public.assignments%rowtype;
begin
  if p_response is null or p_response not in ('CONFIRMED', 'DECLINED') then raise exception 'invalid_response'; end if;
  select t.* into trip from public.trip_requests t join public.access_tokens k on k.trip_request_id = t.id
    where k.token_hash = p_hash and t.role = 'DRIVER';
  if not found then raise exception 'ride_unavailable'; end if;
  perform 1 from public.events where id = trip.event_id for update;
  select a.* into current_assignment from public.assignments a join public.match_runs r on r.id = a.match_run_id
    where a.driver_trip_request_id = trip.id and a.id = p_assignment and r.status = 'APPROVED';
  if not found then raise exception 'ride_unavailable'; end if;
  if current_assignment.status = p_response then return; end if;
  if current_assignment.status not in ('PROPOSED', 'CONFIRMED') then raise exception 'ride_unavailable'; end if;
  update public.assignments set status = p_response, responded_at = now() where id = current_assignment.id;
  if p_response = 'DECLINED' then update public.events set revision = revision + 1 where id = trip.event_id; end if;
end;
$$;

create function public.read_carpool_ride(p_hash text) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  trip public.trip_requests%rowtype;
  active_run public.match_runs%rowtype;
  assignment public.assignments%rowtype;
  event_row public.events%rowtype;
  result jsonb;
  driver jsonb;
  riders jsonb;
begin
  select t.* into trip from public.trip_requests t join public.access_tokens k on k.trip_request_id = t.id
    where k.token_hash = p_hash;
  if not found then return null; end if;
  select * into event_row from public.events where id = trip.event_id;
  result := jsonb_build_object('event', event_row.name, 'timezone', event_row.timezone, 'venue', event_row.venue,
    'role', trip.role, 'leg', trip.leg, 'location', trip.location);
  select * into active_run from public.match_runs
    where event_id = trip.event_id and leg = trip.leg and status = 'APPROVED';
  if not found then return result || jsonb_build_object('status', 'PENDING'); end if;
  select a.* into assignment from public.assignments a
    where a.match_run_id = active_run.id and (
      a.driver_trip_request_id = trip.id or exists (select 1 from public.assignment_riders ar
        where ar.assignment_id = a.id and ar.passenger_trip_request_id = trip.id)
    );
  if not found then return result || jsonb_build_object('status', 'UNMATCHED'); end if;
  result := result || jsonb_build_object('status', assignment.status);
  if assignment.status in ('CANCELLED', 'DECLINED') then return result; end if;

  select jsonb_build_object('name', p.display_name, 'contact', p.contact_value) ||
      case when trip.role = 'DRIVER' then jsonb_build_object('location', t.location) else '{}'::jsonb end
    into driver from public.trip_requests t join public.participants p on p.id = t.participant_id
    where t.id = assignment.driver_trip_request_id;
  result := result || jsonb_build_object('driver', driver, 'departureAt', assignment.departure_at);
  if trip.role = 'PASSENGER' then return result; end if;

  select jsonb_agg(jsonb_build_object('name', p.display_name, 'contact', p.contact_value, 'location', t.location)
    order by ar.stop_order) into riders
    from public.assignment_riders ar join public.trip_requests t on t.id = ar.passenger_trip_request_id
    join public.participants p on p.id = t.participant_id where ar.assignment_id = assignment.id;
  return result || jsonb_build_object('assignmentId', assignment.id, 'extraKm', assignment.extra_km, 'riders', riders);
end;
$$;

revoke all on function
  public.register_carpool(uuid, uuid, text, text, boolean, jsonb, boolean),
  public.create_carpool_event(uuid, jsonb, jsonb),
  public.organizer_workspace(uuid, uuid),
  public.save_carpool_run(uuid, uuid, public.carpool_leg, integer, text, uuid[], jsonb),
  public.approve_carpool_run(uuid, uuid, uuid),
  public.record_carpool_response(text, uuid, public.carpool_assignment_status),
  public.read_carpool_ride(text)
from public, anon, authenticated;
grant execute on function
  public.register_carpool(uuid, uuid, text, text, boolean, jsonb, boolean),
  public.create_carpool_event(uuid, jsonb, jsonb),
  public.organizer_workspace(uuid, uuid),
  public.save_carpool_run(uuid, uuid, public.carpool_leg, integer, text, uuid[], jsonb),
  public.approve_carpool_run(uuid, uuid, uuid),
  public.record_carpool_response(text, uuid, public.carpool_assignment_status),
  public.read_carpool_ride(text)
to service_role;

commit;
