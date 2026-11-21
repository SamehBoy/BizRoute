begin;

alter table public.assignments
  add column route_version integer not null default 0 check (route_version >= 0);

alter table public.assignment_riders
  add column coordination_location jsonb,
  add column coordination_shift_minutes smallint not null default 0 check (coordination_shift_minutes between -30 and 30),
  add column released_at timestamptz,
  drop constraint assignment_riders_match_run_id_passenger_trip_request_id_key;

create unique index assignment_riders_one_current_ride
  on public.assignment_riders (match_run_id, passenger_trip_request_id) where released_at is null;

create function public.coordinate_carpool_seat(
  p_event uuid, p_owner uuid, p_run uuid, p_run_status public.carpool_run_status, p_revision integer,
  p_passenger uuid, p_driver uuid, p_expected_version integer, p_stop_order integer,
  p_extra_km double precision, p_departure_at timestamptz, p_hub_index integer, p_shift_minutes smallint
) returns void
language plpgsql set search_path = ''
as $$
declare
  event_row public.events%rowtype;
  run_row public.match_runs%rowtype;
  target public.assignments%rowtype;
  previous public.assignments%rowtype;
  driver_seats integer;
  stop_count integer;
  agreed_location jsonb;
  stop_index integer;
begin
  select * into event_row from public.events where id = p_event and organizer_id = p_owner for update;
  if not found then raise exception 'event_missing'; end if;
  if event_row.revision <> p_revision then raise exception 'stale_coordination'; end if;
  select * into run_row from public.match_runs where id = p_run and event_id = p_event;
  if not found or run_row.status not in ('PROPOSED', 'APPROVED')
    or run_row.status is distinct from p_run_status
    or (run_row.status = 'PROPOSED' and run_row.revision <> event_row.revision) then
    raise exception 'stale_coordination';
  end if;

  select seats into driver_seats from public.trip_requests
    where id = p_driver and event_id = p_event and leg = run_row.leg and role = 'DRIVER';
  if not found or exists (select 1 from public.assignments
    where event_id = p_event and driver_trip_request_id = p_driver and status = 'DECLINED') then
    raise exception 'stale_coordination';
  end if;
  perform 1 from public.trip_requests
    where id = p_passenger and event_id = p_event and leg = run_row.leg and role = 'PASSENGER';
  if not found then raise exception 'stale_coordination'; end if;

  if p_shift_minutes is null or p_shift_minutes not between -30 and 30 or p_shift_minutes % 5 <> 0 then
    raise exception 'invalid_coordination';
  end if;
  if p_hub_index is not null then
    if run_row.leg <> 'TO_EVENT' or p_shift_minutes <> 0 or p_hub_index < 0
      or p_hub_index >= jsonb_array_length(event_row.hubs) then raise exception 'invalid_coordination'; end if;
    agreed_location := event_row.hubs -> p_hub_index;
  end if;

  select a.* into previous from public.assignments a join public.assignment_riders ar on ar.assignment_id = a.id
    where a.match_run_id = p_run and ar.passenger_trip_request_id = p_passenger and ar.released_at is null;
  if found and previous.status not in ('DECLINED', 'CANCELLED') then raise exception 'stale_coordination'; end if;

  select * into target from public.assignments where match_run_id = p_run and driver_trip_request_id = p_driver;
  if (found and (target.status <> 'PROPOSED' or target.route_version is distinct from p_expected_version))
    or (not found and p_expected_version is not null) then
    raise exception 'stale_coordination';
  end if;
  select count(*) into stop_count from public.assignment_riders where assignment_id = target.id;
  if stop_count >= driver_seats or p_stop_order is null or p_stop_order not between 1 and stop_count + 1 then
    raise exception 'stale_coordination';
  end if;

  if target.id is null then
    insert into public.assignments(match_run_id, event_id, leg, driver_trip_request_id, extra_km, departure_at)
    values(p_run, p_event, run_row.leg, p_driver, p_extra_km, p_departure_at) returning * into target;
  else
    update public.assignments set extra_km = p_extra_km, departure_at = p_departure_at, route_version = route_version + 1
      where id = target.id;
  end if;

  -- Retain the declined route's history and release its hold on this rider.
  if previous.id is not null then
    update public.assignment_riders set released_at = now()
      where assignment_id = previous.id and passenger_trip_request_id = p_passenger and released_at is null;
  end if;

  -- Move tail stops back first so their unique stop numbers stay valid.
  for stop_index in reverse stop_count..p_stop_order loop
    update public.assignment_riders set stop_order = stop_order + 1
      where assignment_id = target.id and stop_order = stop_index;
  end loop;
  insert into public.assignment_riders(assignment_id, match_run_id, event_id, leg, passenger_trip_request_id,
    stop_order, coordination_location, coordination_shift_minutes)
  values(target.id, p_run, p_event, run_row.leg, p_passenger, p_stop_order, agreed_location, p_shift_minutes);

  update public.match_runs set unmatched_ids = array_remove(unmatched_ids, p_passenger) where id = p_run;
end;
$$;

revoke all on function public.coordinate_carpool_seat(
  uuid, uuid, uuid, public.carpool_run_status, integer, uuid, uuid, integer, integer, double precision, timestamptz, integer, smallint
) from public, anon, authenticated;
grant execute on function public.coordinate_carpool_seat(
  uuid, uuid, uuid, public.carpool_run_status, integer, uuid, uuid, integer, integer, double precision, timestamptz, integer, smallint
) to service_role;

create or replace function public.organizer_workspace(p_event uuid, p_owner uuid) returns jsonb
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

create or replace function public.read_carpool_ride(p_hash text) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  trip public.trip_requests%rowtype;
  active_run public.match_runs%rowtype;
  assignment public.assignments%rowtype;
  passenger_stop public.assignment_riders%rowtype;
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
        where ar.assignment_id = a.id and ar.passenger_trip_request_id = trip.id and ar.released_at is null)
    );
  if not found then return result || jsonb_build_object('status', 'UNMATCHED'); end if;
  result := result || jsonb_build_object('status', assignment.status);
  if assignment.status in ('CANCELLED', 'DECLINED') then return result; end if;

  select jsonb_build_object('name', p.display_name, 'contact', p.contact_value) ||
      case when trip.role = 'DRIVER' then jsonb_build_object('location', t.location) else '{}'::jsonb end
    into driver from public.trip_requests t join public.participants p on p.id = t.participant_id
    where t.id = assignment.driver_trip_request_id;
  result := result || jsonb_build_object('driver', driver, 'departureAt', assignment.departure_at);
  if trip.role = 'PASSENGER' then
    select * into passenger_stop from public.assignment_riders
      where assignment_id = assignment.id and passenger_trip_request_id = trip.id and released_at is null;
    result := result || jsonb_build_object('location', coalesce(passenger_stop.coordination_location, trip.location));
    if passenger_stop.coordination_shift_minutes <> 0 then
      result := result || jsonb_build_object('updatedWindow', jsonb_build_object(
        'earliest', trip.earliest_at + make_interval(mins => passenger_stop.coordination_shift_minutes),
        'latest', trip.latest_at + make_interval(mins => passenger_stop.coordination_shift_minutes)));
    end if;
    return result;
  end if;

  select jsonb_agg(jsonb_build_object('name', p.display_name, 'contact', p.contact_value, 'location', coalesce(ar.coordination_location, t.location))
    order by ar.stop_order) into riders
    from public.assignment_riders ar join public.trip_requests t on t.id = ar.passenger_trip_request_id
    join public.participants p on p.id = t.participant_id where ar.assignment_id = assignment.id and ar.released_at is null;
  return result || jsonb_build_object('assignmentId', assignment.id, 'routeVersion', assignment.route_version, 'extraKm', assignment.extra_km, 'riders', riders);
end;
$$;

drop function public.record_carpool_response(text, uuid, public.carpool_assignment_status);

create function public.record_carpool_response(p_hash text, p_assignment uuid, p_response public.carpool_assignment_status, p_version integer default 0)
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
  if not found or current_assignment.route_version is distinct from p_version then raise exception 'ride_unavailable'; end if;
  if current_assignment.status = p_response then return; end if;
  if current_assignment.status not in ('PROPOSED', 'CONFIRMED') then raise exception 'ride_unavailable'; end if;
  update public.assignments set status = p_response, responded_at = now() where id = current_assignment.id;
  if p_response = 'DECLINED' then update public.events set revision = revision + 1 where id = trip.event_id; end if;
end;
$$;

revoke all on function public.record_carpool_response(text, uuid, public.carpool_assignment_status, integer)
  from public, anon, authenticated;
grant execute on function public.record_carpool_response(text, uuid, public.carpool_assignment_status, integer)
  to service_role;

commit;
