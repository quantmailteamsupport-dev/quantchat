function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

const NATIVE_PRODUCTION_FALLBACK = 'http://52.66.196.236';

function resolveApiBase() {
  const configured = process.env.REACT_APP_BACKEND_URL?.trim();
  const nativeConfigured = process.env.REACT_APP_NATIVE_BACKEND_URL?.trim();

  if (typeof window !== 'undefined') {
    const pageOrigin = trimTrailingSlash(window.location.origin);
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(host);
    const isNativeShell = !['http:', 'https:'].includes(protocol) || isLocalHost;
    const nativeBase = trimTrailingSlash(nativeConfigured || configured || NATIVE_PRODUCTION_FALLBACK);

    if (isNativeShell) {
      return nativeBase;
    }

    if (!configured) {
      return pageOrigin;
    }

    try {
      const parsed = new URL(configured, pageOrigin);
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');

      if (parsed.origin !== pageOrigin && !isNativeShell) {
        return pageOrigin;
      }

      if (protocol === 'https:' && parsed.protocol === 'http:' && !isNativeShell) {
        return pageOrigin;
      }

      return `${parsed.origin}${pathname}`;
    } catch {
      return pageOrigin;
    }
  }

  if (!configured) {
    return NATIVE_PRODUCTION_FALLBACK;
  }

  return trimTrailingSlash(configured);
}

export const API = resolveApiBase();
