import type { NextConfig } from "next";
import * as path from "path";

const nextConfig: NextConfig = {
  // Fix turbopack workspace root detection with multiple lockfiles
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
