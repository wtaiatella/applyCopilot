"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef } from "react";

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Create link tag for Swagger UI CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css";
    document.head.appendChild(link);

    // 2. Create script tag for Swagger UI Bundle JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js";
    script.async = true;
    script.onload = () => {
      // 3. Create script tag for Standalone Preset JS
      const presetScript = document.createElement("script");
      presetScript.src = "https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js";
      presetScript.async = true;
      presetScript.onload = () => {
        const win = window as any;
        if (win.SwaggerUIBundle) {
          win.ui = win.SwaggerUIBundle({
            url: "/openapi.yaml",
            dom_id: "#swagger-ui",
            deepLinking: true,
            presets: [
              win.SwaggerUIBundle.presets.apis,
              win.SwaggerUIStandalonePreset,
            ],
            layout: "BaseLayout",
          });
        }
      };
      document.body.appendChild(presetScript);
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup on unmount
      try {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      } catch (err) {
        console.error("Swagger UI cleanup failed", err);
      }
    };
  }, []);

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh", padding: "16px 0" }}>
      <div id="swagger-ui" ref={containerRef} />
    </div>
  );
}
