"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ConfigProvider, theme, App } from "antd";

export type ThemeMode = "dark" | "light";

interface ThemeContextType {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider/ConfigProvider wrapper");
  }
  return context;
}

interface AntdThemeProviderProps {
  children: React.ReactNode;
}

export default function AntdThemeProvider({ children }: AntdThemeProviderProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme_preference") as ThemeMode;
    if (savedTheme === "light" || savedTheme === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeMode(savedTheme);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeMode("dark"); // Default to dark mode per design rules
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      if (themeMode === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
    }
  }, [themeMode, mounted]);

  const toggleTheme = () => {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextTheme);
    localStorage.setItem("theme_preference", nextTheme);
  };

  const currentAlgorithm = themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  // Hydration guard to avoid layout flash: render dark algorithm during server/SSR hydration
  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ themeMode, toggleTheme }}>
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorPrimary: "#2563eb",
              borderRadius: 8,
            },
          }}
        >
          <App>{children}</App>
        </ConfigProvider>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ themeMode, toggleTheme }}>
      <ConfigProvider
        theme={{
          algorithm: currentAlgorithm,
          token: {
            colorPrimary: "#2563eb",
            borderRadius: 8,
          },
        }}
      >
        <App>
          {children}
        </App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
