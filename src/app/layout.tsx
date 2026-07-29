import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXLOG EXPRESS",
  description: "Roteirizador e Calculadora de Frete Profissional",
  manifest: "/manifest.json",
  icons: { icon: "/logo.jpg", apple: "/logo.jpg" },
  appleWebApp: { capable: true, title: "NEXLOG", statusBarStyle: "black-translucent" },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
  themeColor: "#3B1063",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0D0817" }}>
        {children}
      </body>
    </html>
  );
}
