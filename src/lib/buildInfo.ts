export interface AppBuild { version: string; revision: string; sourceDate: string; modified: boolean }
declare const __APP_BUILD__: AppBuild | undefined;
export const appBuild: AppBuild = typeof __APP_BUILD__ === 'undefined'
  ? { version: '0.2.0', revision: '', sourceDate: '', modified: true } : __APP_BUILD__;
