import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * The Final Placement Package upload goes through a Server Action so the
       * merged PDF is validated on the server before it reaches storage. The
       * limit is the 25 MB per-package rule plus room for multipart overhead.
       */
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
