import { SecretBox, StaticKeyProvider } from '@mp/shared';
import type { PlatformMailIdentity } from '@mp/dns-verification';

/** Runtime configuration the core services need, independent of transport (HTTP, SMTP, worker). */
export interface CoreConfig {
  localUnlimitedSending?: boolean;
  secrets: SecretBox;
  verpSecret: string;
  platform: PlatformMailIdentity & { bounceDomain: string };
}

export function localSendingIsUnlimited(env: { NODE_ENV?: string; LOCAL_UNLIMITED_SENDING?: boolean }): boolean {
  return env.NODE_ENV === 'development' && env.LOCAL_UNLIMITED_SENDING === true;
}

export function createCoreConfig(env: {
  NODE_ENV?: string;
  LOCAL_UNLIMITED_SENDING?: boolean;
  ENCRYPTION_KEYS: string;
  VERP_SECRET: string;
  PLATFORM_BOUNCE_DOMAIN: string;
  PLATFORM_BOUNCE_MX_HOST: string;
  PLATFORM_SPF_INCLUDE: string;
  PLATFORM_OUTBOUND_IPS: string[];
}): CoreConfig {
  return {
    localUnlimitedSending: localSendingIsUnlimited(env),
    secrets: new SecretBox(new StaticKeyProvider(env.ENCRYPTION_KEYS)),
    verpSecret: env.VERP_SECRET,
    platform: {
      bounceDomain: env.PLATFORM_BOUNCE_DOMAIN.toLowerCase(),
      bounceMxHost: env.PLATFORM_BOUNCE_MX_HOST.toLowerCase(),
      spfInclude: env.PLATFORM_SPF_INCLUDE.toLowerCase(),
      outboundIps: env.PLATFORM_OUTBOUND_IPS,
    },
  };
}
