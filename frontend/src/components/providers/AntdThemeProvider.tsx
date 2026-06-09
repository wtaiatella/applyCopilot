"use client";

import React from "react";
import { ConfigProvider, theme } from "antd";

interface AntdThemeProviderProps {
  children: React.ReactNode;
}

export default function AntdThemeProvider({ children }: AntdThemeProviderProps) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#2563eb", // blue-600
          borderRadius: 8,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
