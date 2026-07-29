import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXLOG EXPRESS",
  description: "Roteirizador e Calculadora de Frete Profissional",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0D0817" }}>
        {children}
      </body>
    </html>
  );
}
