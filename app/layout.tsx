import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Carpool — Better rides to good events", template: "%s · Carpool" },
  description: "Organize rides to and from any event. Collect trip preferences, match passengers with drivers, and share private ride details.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
