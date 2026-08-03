/** Order detail feature — public API */
export { default as OrderDetailView } from "./OrderDetailView.svelte";

export { default as OrderPageChrome } from "./components/layout/OrderPageChrome.svelte";
export { default as OrderHeader } from "./components/layout/OrderHeader.svelte";
export { default as OrderSidebar } from "./components/layout/OrderSidebar.svelte";
export { default as OrderTabs } from "./components/layout/OrderTabs.svelte";

export { default as OrderFeedbackModal } from "./components/modals/OrderFeedbackModal.svelte";
export { default as OrderEditOffcanvas } from "./components/modals/OrderEditOffcanvas.svelte";
export { default as OrderAssignedUsersModal } from "./components/modals/OrderAssignedUsersModal.svelte";
export { default as OrderVisitModals } from "./components/modals/OrderVisitModals.svelte";
export { default as OrderQueryModals } from "./components/modals/OrderQueryModals.svelte";
export { default as OrderClientModals } from "./components/modals/OrderClientModals.svelte";

export * from "./utils/index.js";
export * from "./constants.js";
export * from "./api/orderDetailApi.js";
export * from "./lib/dom.js";
export * from "./lib/activities.js";
export { createOrderDetail } from "./hooks/index.js";
