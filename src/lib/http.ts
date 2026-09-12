export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    // Next's internal URL can use the bind address (0.0.0.0); the browser uses Host.
    const internalURL = new URL(request.url);
    const host = request.headers.get('host') || internalURL.host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol + ':' : internalURL.protocol;
    return origin === new URL(protocol + '//' + host).origin;
  } catch { return false; }
}
