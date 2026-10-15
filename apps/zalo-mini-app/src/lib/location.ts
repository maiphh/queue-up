import { getLocation } from 'zmp-sdk';

export type LatLng = { lat: number; lng: number };

/**
 * Ask for the guest's location. Only called after they tap "Bật vị trí" (Zalo shows its own
 * permission sheet). Zalo ≥ 2.x returns a server-side token; we only use direct coordinates when
 * the runtime provides them (or the browser in dev). Otherwise distance is simply hidden.
 */
export async function requestLocation(): Promise<LatLng | null> {
  try {
    const r = (await getLocation()) as { latitude?: string | number; longitude?: string | number; token?: string };
    const lat = Number(r?.latitude);
    const lng = Number(r?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return { lat, lng };
  } catch {
    /* denied, or not inside Zalo */
  }
  if (import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 },
      );
    });
  }
  return null;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;
}
