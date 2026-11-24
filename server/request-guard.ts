export type ServerMode = 'development' | 'production';

export function isLocalRequest(request: Request, mode: ServerMode): boolean {
  const allowedHosts =
    mode === 'development'
      ? ['127.0.0.1:3001', '127.0.0.1:5173']
      : ['127.0.0.1:3001'];
  const url = new URL(request.url);
  const host = request.headers.get('Host');
  if (
    url.protocol !== 'http:' ||
    !host ||
    host !== url.host ||
    !allowedHosts.includes(host)
  ) {
    return false;
  }

  const origin = request.headers.get('Origin');
  if (
    origin !== null &&
    !allowedHosts.some((allowed) => origin === `http://${allowed}`)
  ) {
    return false;
  }

  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Site
  const site = request.headers.get('Sec-Fetch-Site');
  return site === null || site === 'same-origin' || site === 'none';
}
