import '@ant-design/v5-patch-for-react-19';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { AntdProvider } from '@/components/ui/antd-provider'
import { AuthProvider } from '@/contexts/auth.context'
import { ReactQueryProvider } from '@/components/providers/react-query-provider'

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ApplyCopilot - AI-Powered Job Search Copilot",
  description: "Automate and optimize your job search with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AntdRegistry>
          <ReactQueryProvider>
            <AuthProvider>
              <AntdProvider>
                {children}
              </AntdProvider>
            </AuthProvider>
          </ReactQueryProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
