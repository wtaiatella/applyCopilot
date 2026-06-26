"use client";

import React from "react";
import { Button, Tooltip } from "antd";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../providers/AntdThemeProvider";

export default function ThemeToggle() {
  const { themeMode, toggleTheme } = useTheme();

  return (
    <Tooltip title={themeMode === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}>
      <Button
        type="text"
        icon={
          themeMode === "dark" ? (
            <Sun className="h-4.5 w-4.5 text-amber-400 transition-transform duration-300 hover:rotate-45" />
          ) : (
            <Moon className="h-4.5 w-4.5 text-slate-700 transition-transform duration-300 hover:-rotate-12" />
          )
        }
        onClick={toggleTheme}
        className="flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 h-8 w-8"
        aria-label="Toggle theme"
        id="theme-toggle-btn"
      />
    </Tooltip>
  );
}
