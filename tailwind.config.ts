import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { ink:'#10152f', forest:'#087b50', mint:'#21d4ad', violet:'#8b5cf6' } } }, plugins: [] };
export default config;
