import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 产出精简运行目录，容器里只需 node server.js
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
