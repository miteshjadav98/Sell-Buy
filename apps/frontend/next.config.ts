import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Product imagery is uploaded by sellers to S3/MinIO or served from a CDN, so
   * the hostnames are not known at build time. The wildcard is a deliberate
   * trade for a reference implementation; a production deployment should pin
   * this to the actual media domains, because an open remote-image loader lets
   * anyone proxy arbitrary content through your own domain.
   */
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
};

export default nextConfig;
