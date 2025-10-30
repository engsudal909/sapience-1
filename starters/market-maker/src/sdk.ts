import path from 'path';
import { pathToFileURL } from 'url';

type SdkModule = Record<string, any>;

export async function loadSdk(): Promise<SdkModule> {
  const override = process.env.SAPIENCE_SDK_PATH;
  if (override && override.trim().length > 0) {
    try {
      const resolved = path.isAbsolute(override)
        ? override
        : path.resolve(process.cwd(), override);
      const url = pathToFileURL(resolved).href;
      return await import(url);
    } catch {}
  }
  return await import('@sapience/sdk');
}


