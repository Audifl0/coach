type HeaderLookup = Pick<Headers, 'get'>;

function readHeader(headers: HeaderLookup, name: string): string | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstForwardedAddress(value: string): string | null {
  const [first] = value.split(',');
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

export function resolveClientIp(headers: HeaderLookup): string {
  const forwardedFor = readHeader(headers, 'x-forwarded-for');
  if (forwardedFor) {
    const forwardedAddress = firstForwardedAddress(forwardedFor);
    if (forwardedAddress) {
      return forwardedAddress;
    }
  }

  const realIp = readHeader(headers, 'x-real-ip');
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = readHeader(headers, 'cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return 'unknown';
}
