import crypto from 'crypto-js';
import {
  HMAC_WEBAPP_SECRET,
  WORKSHOP_BASE_URL,
} from '$lib/constants/constants';

/**
 * Workshop / BOM HMAC client (same auth as DispatchProcess).
 * Used to load employees for App User linking — not Nest CRM users.
 */
function sign(method, path, timestamp) {
  const secret = HMAC_WEBAPP_SECRET || 'labourManagementAndBomProject';
  const payload = `${method.toUpperCase()}|${path}|${timestamp}`;
  return crypto.enc.Hex.stringify(crypto.HmacSHA256(payload, secret));
}

async function workshopFetch(path, method = 'GET', body = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    Accept: 'application/json',
    'x-api-key': 'BOM_PROJECT',
    'x-signature': sign(method, path, timestamp),
    'x-timestamp': String(timestamp),
  };
  const opts = { method, headers };
  if (body != null && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const base = (WORKSHOP_BASE_URL || '').replace(/\/$/, '');
  const resp = await (await fetch(`${base}${path}`, opts)).json();
  if (!resp?.success) {
    throw resp || { message: 'Workshop request failed' };
  }
  return resp;
}

/** @returns {Promise<Array<{_id: string, username?: string, email?: string, name?: string}>>} */
export async function fetchWorkshopSalesEmployees() {
  if (!WORKSHOP_BASE_URL) return [];
  try {
    const resp = await workshopFetch('/user/sales/all', 'GET');
    return Array.isArray(resp?.data) ? resp.data : [];
  } catch {
    return [];
  }
}

export function workshopEmployeeLabel(emp) {
  if (!emp) return '';
  const name = emp.username || emp.name || emp._id || '';
  const email = emp.email ? ` · ${emp.email}` : '';
  return `${name}${email}`;
}
