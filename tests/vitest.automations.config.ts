import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['integration/automations.test.ts'],fileParallelism:false,testTimeout:90_000,hookTimeout:90_000}});
