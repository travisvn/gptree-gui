import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,css,md,mdx,html,json,scss}',
  ],
  darkMode: 'class', // or 'media'
  theme: {
    extend: {
      spacing: {
        'spacing': 'var(--spacing)',
      },
    },
  },
  plugins: [],
};

export default config;