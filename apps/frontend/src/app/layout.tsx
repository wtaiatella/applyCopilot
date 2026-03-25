import '@ant-design/v5-patch-for-react-19';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from '@/components/providers/app-providers';
import { AntdRegistry } from '@ant-design/nextjs-registry';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ApplyCopilot - Sistema Inteligente de Busca de Empregos",
  description: "Automatize e otimize sua busca por empregos com IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AntdRegistry>
          <AppProviders>
            {children}
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
