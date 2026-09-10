import { writable } from 'svelte/store';

function currentUserId() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u?.id ?? null;
  } catch {
    return null;
  }
}

function createFilterStore(storeKey, defaultState = {}, { scopeByUser = false } = {}) {
    const resolveKey = () => {
      if (!scopeByUser) return storeKey;
      const id = currentUserId();
      return id != null ? `${storeKey}:${id}` : storeKey;
    };

    let savedState = null;

    if (typeof localStorage !== 'undefined') {
      // Drop legacy unscoped key so master filters cannot leak into Viewing-as sessions.
      if (scopeByUser) {
        try { localStorage.removeItem(storeKey); } catch (_) {}
      }
      try {
        const raw = localStorage.getItem(resolveKey());
        savedState = raw ? JSON.parse(raw) : null;
      } catch {
        savedState = null;
      }
    }

    const initialState = savedState ? savedState : defaultState;

    const store = writable(initialState);

    store.subscribe(($store) => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(resolveKey(), JSON.stringify($store));
        }
    });

    return store;
}

/** Order list filters — scoped so Viewing as admin keeps that admin's user selection. */
export const orderFilterStore = createFilterStore('orderFilter', {}, { scopeByUser: true });
export const orderActivityFilterStore = createFilterStore('orderActivityFilter');
export const invoiceFilterStore = createFilterStore('invoiceFilter');
export const workOrderFilterStore = createFilterStore('workOrderFilter');
export const activityFilterStore = createFilterStore('activityFilter');
export const notificationFilterStore = createFilterStore('notificationFilter');
export const paymentFilterStore = createFilterStore('paymentFilter');
export const dashboardFilterStore = createFilterStore('dashboardFilter');
export const adminDashboardFilterStore = createFilterStore('adminDashboardFilter');
export const authActivityFilterStore = createFilterStore('authActivityFilter');
export const orderExcelFilterStore = createFilterStore('orderExcelFilter');
export const taxInvoiceFilterStore = createFilterStore('taxInvoiceFilter');
export const queryFilterStore = createFilterStore('queryFilter');
export const queryOpenFilterStore = createFilterStore('queryOpenFilter');
export const queryAssignedFilterStore = createFilterStore('queryAssignedFilter');
export const querySubQueueFilterStore = createFilterStore('querySubQueueFilter');
export const mediaFilterStore = createFilterStore('mediaFilter');
export const clientVisitFilterStore = createFilterStore('clientVisitFilter');
export const piSalesFilterStore = createFilterStore('piSalesFilter');
