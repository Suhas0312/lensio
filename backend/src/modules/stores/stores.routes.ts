import { Router } from 'express';
import { getSettings } from '../settings/settings.service';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';

const r = Router();

/** Straight-line distance in km, for sorting only (good enough at city scale; no maps API needed). */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Public list of store locations, optionally sorted by distance from the customer. */
r.get('/', ah(async (req, res) => {
  if (!(await getSettings()).storesEnabled) return res.json([]);   // "Find a store" switched off in admin
  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const withDist = stores.map((s) => ({ ...s, distanceKm: s.latitude != null && s.longitude != null ? haversineKm({ lat, lng }, { lat: s.latitude, lng: s.longitude }) : null }));
    withDist.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return res.json(withDist);
  }
  res.json(stores.map((s) => ({ ...s, distanceKm: null })));
}));

export default r;
