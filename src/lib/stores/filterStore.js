import { writable } from 'svelte/store';

function createFilterStore(storeKey, defaultState = {}) {
    let savedState = null;

    if (typeof localStorage !== "undefined") {
        savedState = JSON.parse(localStorage.getItem(storeKey));
    }

    const initialState = savedState ? savedState : defaultState;

    const store = writable(initialState);

    store.subscribe(($store) => {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(storeKey, JSON.stringify($store));
        }
    });

    return store;
}

export const orderFilterStore = createFilterStore('orderFilter');
export const orderActivityFilterStore = createFilterStore('orderActivityFilter');
export const invoiceFilterStore = createFilterStore('invoiceFilter');
export const workOrderFilterStore = createFilterStore('workOrderFilter');
export const activityFilterStore = createFilterStore('activityFilter');
export const notificationFilterStore = createFilterStore('notificationFilter');
export const paymentFilterStore = createFilterStore('paymentFilter');
export const dashboardFilterStore = createFilterStore('dashboardFilter');
export const adminDashboardFilterStore = createFilterStore('adminDashboardFilter');
export const authActivityFilterStore = createFilterStore('authActivityFilter');
