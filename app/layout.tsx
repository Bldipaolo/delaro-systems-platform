import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delaro Systems",
  description: "Operational systems and technology consultancy platform.",
  icons: { icon: "/brand/delaro-mark.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
