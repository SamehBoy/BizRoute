import "server-only";
import { cookies } from "next/headers";

const cookieName = "carpool_my_ride";

function options(eventToken: string) {
  return {
    path: `/e/${eventToken}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export async function rememberedRegistration() {
  return (await cookies()).get(cookieName)?.value;
}

export async function rememberRegistration(eventToken: string, receipt: string) {
  (await cookies()).set(cookieName, receipt, { ...options(eventToken), maxAge: 365 * 24 * 60 * 60 });
}

export async function forgetRegistration(eventToken: string) {
  (await cookies()).set(cookieName, "", { ...options(eventToken), maxAge: 0 });
}
