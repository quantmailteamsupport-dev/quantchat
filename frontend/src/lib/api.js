function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function resolveApiBase() {
  const configured = process.env.REACT_APP_BACKEND_URL?.trim();

  if (typeof window !== 'undefined') {
    const pageOrigin = trimTrailingSlash(window.location.origin);
    const protocol = window.location.protocol;
    const isNativeShell = !['http:', 'https:'].includes(protocol) || window.location.hostname === 'localhost';

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
    throw new Error('REACT_APP_BACKEND_URL is required');
  }

  return trimTrailingSlash(configured);
}

export const API = resolveApiBase();
