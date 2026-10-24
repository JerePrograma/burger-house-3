import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Burger House 3 · Tu burger. Tus reglas.",
  description: "Todo el sabor de Burger House 3. Personalizá tu pedido y envialo por WhatsApp. Retiro y delivery en Marcos Paz y Mariano Acosta.",
  icons: {
    icon: "/images/logo.png",
    shortcut: "/images/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
