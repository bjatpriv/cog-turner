/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.discogs.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'st.discogs.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
}

export default nextConfig;
