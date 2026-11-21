export function organizerDestination(value: unknown) {
  return value === "/dashboard/events/new" ? "/dashboard/events/new" : "/dashboard";
}

export function organizerLoginPath(destination = "/dashboard") {
  return organizerDestination(destination) === "/dashboard/events/new"
    ? "/login?next=/dashboard/events/new"
    : "/login";
}
