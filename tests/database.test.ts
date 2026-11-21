import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { demoFixture } from "../lib/demo";

test("PostgreSQL enforces event isolation, lifecycle, capacity, scopes, and erasure", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261121000000_carpool.sql", import.meta.url), "utf8"));

  const owner = randomUUID();
  const otherOwner = randomUUID();
  await db.query("insert into auth.users values ($1), ($2)", [owner, otherOwner]);
  await db.exec("set role service_role");
  const { event } = demoFixture("2099-06-12T17:30");
  async function eventFor(organizer: string, digit: string) {
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      "select public.create_carpool_event($1, $2::jsonb, '[]') as id", [organizer, JSON.stringify({ ...event, public_token: digit.repeat(48) })],
    );
    return id;
  }
  const eventId = await eventFor(owner, "a");
  const otherId = await eventFor(otherOwner, "b");
  const first = Date.parse(event.starts_at) - 60 * 60_000;
  const get = async <T>(sql: string, params: unknown[]): Promise<T> => (await db.query<{ value: T }>(sql, params)).rows[0].value;
  const snapshot = (id = eventId, organizer = owner) => get<{
    event: { revision: number }; trips: { id: string; detour_minutes: number | null; detour_km: number | null }[]; participants: { id: string }[];
    runs: { id: string; status: string }[]; declined_driver_ids: string[];
  } | null>("select public.organizer_workspace($1, $2) as value", [id, organizer]);

  function newTrip(role: "DRIVER" | "PASSENGER", seats = 1, leg = "TO_EVENT") {
    const id = randomUUID();
    const token_hash = createHash("sha256").update(id).digest("hex");
    return {
      id, token_hash, role, leg, seats: role === "DRIVER" ? seats : null, detour_minutes: role === "DRIVER" ? 20 : null,
      location: { lat: 47.6, lng: -122.3, label: "Public library" },
      earliest_at: new Date(first).toISOString(), vehicle_available: role === "DRIVER",
    };
  }

  async function join(id: string, participantId: string, name: string, trips: unknown[]) {
    await db.query("select public.register_carpool($1, $2, $3, $4, true, $5::jsonb, false)",
      [id, participantId, name, `${name}@example.invalid`, JSON.stringify(trips)]);
  }

  const driver = newTrip("DRIVER");
  const driverTwo = { ...newTrip("DRIVER"), detour_minutes: null, detour_km: 2.5 };
  const driverReturn = newTrip("DRIVER", 2, "FROM_EVENT");
  const rider = newTrip("PASSENGER");
  const riderTwo = newTrip("PASSENGER");
  const riderReturn = newTrip("PASSENGER", 0, "FROM_EVENT");
  const foreign = newTrip("PASSENGER");
  const participantId = randomUUID();
  await join(eventId, participantId, "driver", [driver, driverReturn]);
  await db.exec("reset role");
  await db.exec(await readFile(new URL("../supabase/migrations/20261121010000_carpool_detour_km.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261121020000_carpool_coordination.sql", import.meta.url), "utf8"));
  await db.exec("set role service_role");
  await join(eventId, participantId, "driver", [newTrip("DRIVER")]);
  await assert.rejects(join(eventId, randomUUID(), "conflicting-limit",
    [{ ...newTrip("DRIVER"), detour_km: 2 }]), /trip_requests_driver_offer_check/);
  await join(eventId, randomUUID(), "second-driver", [driverTwo]);
  await join(eventId, randomUUID(), "first-rider", [rider, riderReturn]);
  await join(eventId, randomUUID(), "unrelated-rider", [riderTwo]);
  await join(otherId, randomUUID(), "foreign", [foreign]);

  assert.equal((await snapshot())!.participants.length, 4);
  const savedTrips = (await snapshot())!.trips;
  assert.equal(savedTrips.length, 6);
  assert.equal(savedTrips.find(({ id }) => id === driver.id)?.detour_minutes, 20);
  assert.equal(savedTrips.find(({ id }) => id === driverTwo.id)?.detour_km, 2.5);
  assert.equal(await snapshot(otherId), null);
  assert.equal(await snapshot(eventId, otherOwner), null);

  const route = (driverId: string, ...passengers: string[]) => ({
    driverId, stops: passengers.map((passengerId) => ({ passengerId })), extraKm: .8, departureIso: new Date(first).toISOString(),
  });
  const save = (revision: number, routes: unknown[], leg = "TO_EVENT", organizer = owner) =>
    get<string>("select public.save_carpool_run($1, $2, $3::public.carpool_leg, $4, 'test', '{}', $5::jsonb) as value",
      [eventId, organizer, leg, revision, JSON.stringify(routes)]);
  const approve = (id: string, organizer = owner) => db.query("select public.approve_carpool_run($1, $2, $3)", [eventId, organizer, id]);
  const readRide = (hash: string) => get<Record<string, unknown> | null>("select public.read_carpool_ride($1) as value", [hash]);
  const respond = (hash: string, id: unknown, response: string) =>
    db.query("select public.record_carpool_response($1, $2, $3::public.carpool_assignment_status)", [hash, id, response]);

  assert.equal(await readRide("0".repeat(64)), null);
  assert.equal((await readRide(rider.token_hash))!.status, "PENDING");
  assert.equal((await readRide(riderReturn.token_hash))!.status, "PENDING");
  await assert.rejects(save(4, [route(driver.id, rider.id)], "TO_EVENT", otherOwner), /event_missing/);
  await assert.rejects(save(4, [route(driver.id, rider.id, riderTwo.id)]), /invalid_capacity/);
  await assert.rejects(save(4, [route(driver.id, foreign.id)]), /foreign key/);
  await assert.rejects(save(4, [route(driver.id, rider.id), route(driverTwo.id, rider.id)]), /duplicate key/);
  assert.equal((await snapshot())!.runs.length, 0);

  const firstRun = await save(4, [route(driver.id, rider.id)]);
  const redo = await save(4, [route(driver.id, rider.id)]);
  await assert.rejects(approve(firstRun), /stale_run/);
  await assert.rejects(approve(redo, otherOwner), /event_missing/);
  assert.equal((await readRide(rider.token_hash))!.status, "PENDING");
  await approve(redo);
  const driverView = (await readRide(driver.token_hash))!;
  const riderView = (await readRide(rider.token_hash))!;
  assert.equal(driverView.status, "PROPOSED");
  assert.equal((driverView.riders as { name: string }[])[0].name, "first-rider");
  assert.equal(riderView.status, "PROPOSED");
  assert.equal((riderView.driver as { name: string }).name, "driver");
  assert.equal("riders" in riderView, false);
  assert.equal("location" in (riderView.driver as object), false);
  assert.equal((await readRide(riderTwo.token_hash))!.status, "UNMATCHED");
  assert.equal((await readRide(foreign.token_hash))!.status, "PENDING");
  await assert.rejects(respond(rider.token_hash, driverView.assignmentId, "CONFIRMED"), /ride_unavailable/);
  await assert.rejects(respond(driverTwo.token_hash, driverView.assignmentId, "CONFIRMED"), /ride_unavailable/);
  await respond(driver.token_hash, driverView.assignmentId, "CONFIRMED");
  assert.equal((await readRide(rider.token_hash))!.status, "CONFIRMED");

  const back = await save(4, [route(driverReturn.id, riderReturn.id)], "FROM_EVENT");
  await approve(back);
  assert.equal((await readRide(riderReturn.token_hash))!.status, "PROPOSED");
  const draft = await save(4, [route(driverTwo.id, riderTwo.id)]);
  await respond(driver.token_hash, driverView.assignmentId, "DECLINED");
  assert.equal((await readRide(rider.token_hash))!.status, "DECLINED");
  assert.equal("driver" in (await readRide(rider.token_hash))!, false);
  assert.deepEqual((await snapshot())!.declined_driver_ids, [driver.id]);
  await assert.rejects(approve(draft), /stale_run/);
  await assert.rejects(save(5, [route(driver.id, rider.id)]), /driver_declined/);
  const fresh = await save(5, [route(driverTwo.id, rider.id)]);
  await approve(fresh);
  assert.equal((await readRide(rider.token_hash))!.status, "PROPOSED");
  assert.equal((await readRide(riderReturn.token_hash))!.status, "PROPOSED");
  await assert.rejects(respond(driver.token_hash, driverView.assignmentId, "CONFIRMED"), /ride_unavailable/);

  await db.query("update public.events set registration_open = false where id = $1", [eventId]);
  await assert.rejects(join(eventId, randomUUID(), "cannot-join", [newTrip("PASSENGER")]), /registration_closed/);
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from public.participants"), /permission denied/);
  await assert.rejects(readRide(rider.token_hash), /permission denied/);
  await db.exec("set role authenticated");
  await assert.rejects(snapshot(), /permission denied/);
  await db.exec("set role service_role");
  await db.query("delete from public.events where id = $1 and organizer_id = $2", [eventId, owner]);
  assert.equal(await readRide(rider.token_hash), null);
  assert.equal(await snapshot(), null);
  assert.equal((await snapshot(otherId, otherOwner))!.trips.length, 1);
});

test("coordination adds one rider to an approved run and preserves confirmed cars and released stops", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  for (const name of ["20261121000000_carpool.sql", "20261121010000_carpool_detour_km.sql", "20261121020000_carpool_coordination.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  const owner = randomUUID();
  const { event } = demoFixture("2099-06-12T17:30");
  const departure = new Date(Date.parse(event.starts_at) - 60 * 60_000).toISOString();
  const location = { lat: 47.6, lng: -122.3, label: "Original library" };
  await db.query("insert into auth.users values ($1)", [owner]);
  await db.exec("set role service_role");

  const query = async <T>(sql: string, params: unknown[]) => (await db.query<{ value: T }>(sql, params)).rows[0].value;
  const eventId = await query<string>("select public.create_carpool_event($1, $2::jsonb, '[]') as value",
    [owner, JSON.stringify({ ...event, public_token: "c".repeat(48) })]);
  async function join(name: string, seats?: number) {
    const id = randomUUID();
    const hash = createHash("sha256").update(id).digest("hex");
    const trips = [{
      id, token_hash: hash, role: seats ? "DRIVER" : "PASSENGER", leg: "TO_EVENT",
      seats: seats ?? null, detour_minutes: seats ? 30 : null, location, earliest_at: departure, vehicle_available: !!seats,
    }];
    await db.query("select public.register_carpool($1, $2, $3, null, true, $4::jsonb, false)",
      [eventId, randomUUID(), name, JSON.stringify(trips)]);
    return { id, hash };
  }

  const fixedDriver = await join("Confirmed driver", 2);
  const driver = await join("Pending driver", 3);
  const backup = await join("Backup driver", 1);
  const fixed = await join("Confirmed passenger");
  const pending = await join("Pending passenger");
  const waiting = await join("First unmatched");
  const other = await join("Second unmatched");

  const runId = await query<string>(`select public.save_carpool_run($1, $2, 'TO_EVENT', 7, 'test', $3::uuid[], $4::jsonb) as value`, [
    eventId, owner, [waiting.id, other.id],
    JSON.stringify([[fixedDriver, fixed], [driver, pending]].map(([driver, rider]) => ({
      driverId: driver.id, extraKm: 0, departureIso: departure, stops: [{ passengerId: rider.id }],
    }))),
  ]);
  await db.query("select public.approve_carpool_run($1, $2, $3)", [eventId, owner, runId]);
  const ride = (hash: string) => query<{
    assignmentId: string; routeVersion: number; status: string; location: { label: string };
    riders: { name: string; location: { label: string } }[];
    updatedWindow?: { earliest: string; latest: string | null };
  }>("select public.read_carpool_ride($1) as value", [hash]);
  const answer = (hash: string, assignment: string, version: number, status: string) =>
    db.query("select public.record_carpool_response($1, $2, $3::public.carpool_assignment_status, $4)",
      [hash, assignment, status, version]);
  const fixedRoute = await ride(fixedDriver.hash);
  const pendingRoute = await ride(driver.hash);
  await answer(fixedDriver.hash, fixedRoute.assignmentId, 0, "CONFIRMED");
  const add = ({ rider, to, version, hub = null, shift = 0, revision = 7, caller = owner }: {
    rider: string; to: string; version: number | null; hub?: number | null; shift?: number; revision?: number; caller?: string;
  }) => db.query(`select public.coordinate_carpool_seat(
    $1, $2, $3, 'APPROVED', $4, $5, $6, $7, 1, 0.2, $8, $9, $10::smallint)`,
  [eventId, caller, runId, revision, rider, to, version, departure, hub, shift]);

  await assert.rejects(add({ rider: waiting.id, to: driver.id, version: 0, caller: randomUUID() }), /event_missing/);
  await assert.rejects(add({ rider: waiting.id, to: fixedDriver.id, version: 0 }), /stale_coordination/);
  await add({ rider: waiting.id, to: driver.id, version: 0, hub: 0 });
  const updated = await ride(driver.hash);
  assert.equal(updated.assignmentId, pendingRoute.assignmentId);
  assert.equal(updated.routeVersion, 1);
  assert.deepEqual(updated.riders.map(({ name }) => name), ["First unmatched", "Pending passenger"]);
  assert.equal(updated.riders[0].location.label, event.hubs[0].label);
  assert.equal((await ride(waiting.hash)).location.label, event.hubs[0].label);
  assert.equal((await ride(fixed.hash)).status, "CONFIRMED");
  assert.deepEqual((await ride(fixedDriver.hash)).riders, fixedRoute.riders);
  await assert.rejects(add({ rider: waiting.id, to: backup.id, version: null }), /stale_coordination/);
  await assert.rejects(add({ rider: other.id, to: driver.id, version: 0 }), /stale_coordination/);
  await assert.rejects(answer(driver.hash, pendingRoute.assignmentId, 0, "CONFIRMED"), /ride_unavailable/);

  await answer(driver.hash, pendingRoute.assignmentId, 1, "DECLINED");
  await add({ rider: waiting.id, to: backup.id, version: null, shift: 5, revision: 8 });
  assert.equal((await ride(waiting.hash)).status, "PROPOSED");
  assert.equal((await ride(waiting.hash)).location.label, location.label);
  assert.equal(Date.parse((await ride(waiting.hash)).updatedWindow!.earliest), Date.parse(departure) + 5 * 60_000);
  assert.equal((await ride(pending.hash)).status, "DECLINED");
  const stops = await db.query<{ released: boolean; shift: number }>(`select released_at is not null as released,
    coordination_shift_minutes as shift from public.assignment_riders
    where match_run_id = $1 and passenger_trip_request_id = $2 order by released_at nulls last`, [runId, waiting.id]);
  assert.deepEqual(stops.rows, [{ released: true, shift: 0 }, { released: false, shift: 5 }]);
  await assert.rejects(add({ rider: other.id, to: backup.id, version: 0, revision: 8 }), /stale_coordination/);
  await db.exec("set role authenticated");
  await assert.rejects(add({ rider: other.id, to: backup.id, version: 0, revision: 8 }), /permission denied/);
});

test("a private registration receipt scopes both trip legs to the same guest", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
  `);
  for (const name of [
    "20261121000000_carpool.sql", "20261121010000_carpool_detour_km.sql",
    "20261121020000_carpool_coordination.sql", "20261121030000_carpool_my_ride.sql",
  ]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  const owner = randomUUID();
  const { event } = demoFixture("2099-06-12T17:30");
  await db.query("insert into auth.users values ($1)", [owner]);
  await db.exec("set role service_role");

  const query = async <T>(sql: string, params: unknown[]) => (await db.query<{ value: T }>(sql, params)).rows[0].value;
  const eventToken = "d".repeat(48);
  const eventId = await query<string>("select public.create_carpool_event($1, $2::jsonb, '[]') as value",
    [owner, JSON.stringify({ ...event, public_token: eventToken })]);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const departure = new Date(Date.parse(event.starts_at) - 60 * 60_000).toISOString();
  function trip(leg: string, role: "DRIVER" | "PASSENGER") {
    const id = randomUUID();
    return { id, token_hash: hash(id), leg, role, location: event.venue, earliest_at: departure,
      seats: role === "DRIVER" ? 2 : null, detour_minutes: role === "DRIVER" ? 15 : null, vehicle_available: role === "DRIVER" };
  }
  const outbound = trip("TO_EVENT", "DRIVER");
  const returning = trip("FROM_EVENT", "PASSENGER");
  const separateRider = trip("TO_EVENT", "PASSENGER");
  const participantId = randomUUID();
  const separateId = randomUUID();
  const receipt = hash("first private receipt");
  const separateReceipt = hash("second private receipt");
  async function register(id: string, name: string, trips: ReturnType<typeof trip>[], receipt: string) {
    await db.query("select public.register_carpool_with_receipt($1,$2,$3,null,true,$4::jsonb,$5)",
      [eventId, id, name, JSON.stringify(trips), receipt]);
  }
  type Receipt = {
    eventId: string; eventToken: string; guestName: string;
    trips: { tripId: string; ride: { leg: string; role: string; status: string; riders?: { name: string }[] } }[];
  };
  const read = (tokenHash: string) => query<Receipt | null>("select public.read_carpool_registration($1) as value", [tokenHash]);

  await register(participantId, "First guest", [outbound, returning], receipt);
  await register(participantId, "Retried guest", [trip("TO_EVENT", "PASSENGER")], receipt);
  await assert.rejects(register(participantId, "First guest", [outbound], hash("different receipt")), /registration_receipt_mismatch/);
  await assert.rejects(register(randomUUID(), "Rollback guest", [trip("TO_EVENT", "PASSENGER")], "bad-hash"), /check constraint/);
  await register(separateId, "Second guest", [separateRider], separateReceipt);

  assert.equal(await read(hash("made up receipt")), null);
  assert.equal(await read(outbound.token_hash), null);
  const beforeApproval = (await read(receipt))!;
  assert.equal(beforeApproval.guestName, "First guest");
  assert.equal(beforeApproval.eventId, eventId);
  assert.equal(beforeApproval.eventToken, eventToken);
  assert.deepEqual(beforeApproval.trips.map(({ tripId, ride }) => [tripId, ride.role, ride.status]), [
    [outbound.id, "DRIVER", "PENDING"], [returning.id, "PASSENGER", "PENDING"],
  ]);
  assert.deepEqual((await read(separateReceipt))!.trips.map(({ tripId }) => tripId), [separateRider.id]);

  const run = await query<string>(`select public.save_carpool_run($1, $2, 'TO_EVENT', 2, 'test', '{}'::uuid[], $3::jsonb) as value`,
    [eventId, owner, JSON.stringify([{ driverId: outbound.id, departureIso: departure, extraKm: 0,
      stops: [{ passengerId: separateRider.id }] }])]);
  await db.query("select public.approve_carpool_run($1,$2,$3)", [eventId, owner, run]);
  const approved = (await read(receipt))!;
  assert.equal(approved.trips[0].ride.status, "PROPOSED");
  assert.equal(approved.trips[0].ride.riders?.[0].name, "Second guest");
  assert.equal(approved.trips[1].ride.status, "PENDING");
  assert.equal("riders" in (await read(separateReceipt))!.trips[0].ride, false);

  const workspace = await query<{ participants: { has_my_ride: boolean }[] }>(
    "select public.organizer_workspace($1, $2) as value", [eventId, owner],
  );
  assert.deepEqual(workspace.participants.map((participant) => participant.has_my_ride), [true, true]);
  await db.exec("set role anon");
  await assert.rejects(read(receipt), /permission denied/);
  await db.exec("set role service_role");
  await db.query("delete from public.events where id = $1", [eventId]);
  assert.equal(await read(receipt), null);
});
