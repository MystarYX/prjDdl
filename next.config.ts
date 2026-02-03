import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  // TypeScript 配置 - 排除不需要检查的目录
  typescript: {
    // 在构建时跳过 TypeScript 类型检查（因为我们只需要检查当前项目的文件）
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
