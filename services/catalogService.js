// Service catalog — per-master prices from Google Sheets with config fallback.

import { SERVICES as DEFAULT_SERVICES, MASTERS } from '../config.js';
import { getMasterServicesFromSheets } from './bookingService.js';

export async function getMasterServices(masterName) {
  try {
    const services = await getMasterServicesFromSheets(masterName);
    if (services.length) return services;
  } catch (err) {
    console.error('[Catalog] Failed to load services for', masterName, err.message);
  }
  return DEFAULT_SERVICES.map((s) => ({ ...s }));
}

export async function getAllServicesUnion() {
  const byName = new Map();
  for (const master of MASTERS) {
    const list = await getMasterServices(master.name);
    for (const service of list) {
      const existing = byName.get(service.name);
      if (!existing || service.price < existing.price) {
        byName.set(service.name, { ...service });
      }
    }
  }
  return [...byName.values()];
}

export function formatServicesList(services) {
  return services.map((s) => `- ${s.name} — ${s.price} ₽`).join('\n');
}
