<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { get } from "svelte/store";
  import { companiesAllStore } from "$lib/stores/dataStores";
  let loadingData = true;

  let orders = [];
  let companies = [];

  // Form state
  let workOrderType = "order";
  let title = null;
  let orderId = null;
  let companyId = null;
  let workOrderDate = null;
  let orderNo = "";
  let poNumber = "";
  let items = [];
  let remarks = "";
  let dispatchAddress = "";
  let installationDate = null;
  let installationEngineer = "";
  let dispatchPincode = "";
  let packingType = null;
  let packingCharges = null;
  let inCoterms = null;
  let inCotermsBy = null;
  let transporterName = "";
  let paymentMethod = null;

  let loading = false;
  let errorMessage = "";

  // Field-specific error messages
  let formErrors = {};
  onMount(() => {
    setTimeout(() => {
      loadingData = false;
    }, 500);
  });

  async function orderValueChange(e) {
    const id = Number(e.target.value); // or parseInt(e.target.value, 10)
    if (!isNaN(id)) {
      const newOrder = orders.find((order) => order.id === id);
      if (newOrder) {
        title = newOrder.title;
      } else {
        console.log("Order not found for id:", id);
      }
    } else {
      console.warn("Invalid ID: Not a number");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const newWorkOrder = {
      title,
      items,
      remarks,
      orderNo,
      poNumber,
      dispatchAddress,
      installationEngineer,
      dispatchPincode,
      packingType,
      packingCharges,
      inCoterms,
      inCotermsBy,
      transporterName,
      paymentMethod,
    };
    if (workOrderDate) {
      newWorkOrder.workOrderDate = workOrderDate;
    }
    if (installationDate) {
      newWorkOrder.installationDate = installationDate;
    }
    newWorkOrder.companyId = companyId;
    if (workOrderType == "order") {
      newWorkOrder.orderId = orderId;
      if (orderId == null) {
        formErrors.orderId = ["Order is required."];
        loading = false;
        return;
      }
    }
    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }
    if (items.length == 0) {
      Swal.fire("Warning!", "Please atleast one item add in items.", "warning");
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(API_ROUTES.WORK_ORDER, {
        method: "POST",
        data: JSON.stringify(newWorkOrder),
      });

      Swal.fire("Success!", data.message, "success");
      goto("/admin/workorder");
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }

  function addItem() {
    items = [
      ...items,
      { item: "", quantity: "0", price: 0, hsCode: "", total: 0 },
    ];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER);
      orders = data;
    } catch (err) {
      errorMessage = "Failed to load order data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  onMount(async () => {
    const cached = get(companiesAllStore);
    if (cached && cached.length > 0) {
      companies = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load company data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  let inCotermsArray = ["In India", "Outside India"];
  let inCotermsInArray = ["Ex", "Door Delivery", "Godown"];
  let inCotermsOutsideArray = ["Ex", "FOB", "CIF"];
  let paymentMethodArray = ["To Pay", "Paid"];

  $: [packingType], changeState();
  function changeState() {
    if (packingType != "Wooden Packing") {
      packingCharges = null;
    }
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Add Work Order</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item">
            <a href="/admin/workorder">Work Orders</a>
          </li>
          <li class="breadcrumb-item active" aria-current="page">
            Add Work Order
          </li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Add Work Order</h5>
        <a href="/admin/workorder" class="btn btn-primary">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Work Order List
        </a>
      </div>

      <div class="card-body">
        <form
          on:submit={handleSubmit}
          class="needs-validation space-y-4"
          novalidate
        >
          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-3">
              <label class="form-label" for="workOrderType">
                Work Order Type <span class="text-danger">*</span>
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="radio"
                  id="order"
                  name="workOrderType"
                  value="order"
                  bind:group={workOrderType}
                />
                <label for="order">Order</label>

                <input
                  type="radio"
                  id="self"
                  name="workOrderType"
                  value="self"
                  bind:group={workOrderType}
                />
                <label for="self">Self</label>
              </div>
            </div>

            {#if workOrderType == "order"}
              <div class="col-span-2">
                <label class="form-label" for="orderId">
                  Order <span class="text-danger">*</span>
                </label>
                <select
                  name="orderId"
                  id="orderId"
                  class="select form-control"
                  class:is-invalid={formErrors.orderId}
                  on:change={(e) => orderValueChange(e)}
                  bind:value={orderId}
                  required
                >
                  <option value={null}>Select Order</option>
                  {#each orders as order}
                    <option value={order?.id}>{order?.title}</option>
                  {/each}
                </select>
                {#if formErrors.orderId}
                  <ul class="text-danger mt-1 text-xs capitalize">
                    <li>{formErrors.orderId[0]}</li>
                  </ul>
                {/if}
              </div>
            {:else}
              <div class="col-span-2">
                <label class="form-label" for="title"
                  >Title <span class="text-danger">*</span></label
                >
                <input
                  type="text"
                  name="title"
                  class="form-control"
                  class:is-invalid={formErrors.title}
                  bind:value={title}
                  id="title"
                  placeholder="Title"
                />
                {#if formErrors.title}
                  <ul class="text-danger mt-1 text-xs capitalize">
                    <li>{formErrors.title[0]}</li>
                  </ul>
                {/if}
              </div>
            {/if}

            <div>
              <label class="form-label" for="companyId">
                Company <span class="text-danger">*</span>
              </label>
              <select
                name="companyId"
                id="companyId"
                class="select form-control"
                class:is-invalid={formErrors.companyId}
                bind:value={companyId}
                required
              >
                <option value={null}>Select Company</option>
                {#each companies as order}
                  <option value={order?.id}>{order?.name}</option>
                {/each}
              </select>
              {#if formErrors.companyId}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.companyId[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="orderNo">
                Work Order Number
                <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="orderNo"
                class="form-control"
                class:is-invalid={formErrors.orderNo}
                bind:value={orderNo}
                id="orderNo"
                placeholder="Work Order Number"
              />
              {#if formErrors.orderNo}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.orderNo[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="workOrderDate">
                Work Order Date
              </label>
              <input
                type="date"
                name="workOrderDate"
                class="form-control"
                class:is-invalid={formErrors.workOrderDate}
                bind:value={workOrderDate}
                id="workOrderDate"
                placeholder="Work Order Date"
              />
              {#if formErrors.workOrderDate}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.workOrderDate[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="poNumber">PO Number</label>
              <input
                type="text"
                name="poNumber"
                class="form-control"
                class:is-invalid={formErrors.poNumber}
                bind:value={poNumber}
                id="poNumber"
                placeholder="PO Number"
              />
              {#if formErrors.poNumber}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.poNumber[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="dispatchAddress">
                Dispatch Address
              </label>
              <input
                type="text"
                name="dispatchAddress"
                class="form-control"
                class:is-invalid={formErrors.dispatchAddress}
                bind:value={dispatchAddress}
                id="dispatchAddress"
                placeholder="Dispatch Address"
              />
              {#if formErrors.dispatchAddress}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.dispatchAddress[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="dispatchPincode">
                Dispatch Pincode
              </label>
              <input
                type="text"
                name="dispatchPincode"
                class="form-control"
                class:is-invalid={formErrors.dispatchPincode}
                bind:value={dispatchPincode}
                id="dispatchPincode"
                placeholder="Dispatch Pincode"
              />
              {#if formErrors.dispatchPincode}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.dispatchPincode[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="transporterName">
                Transporter Name
              </label>
              <input
                type="text"
                name="transporterName"
                class="form-control"
                class:is-invalid={formErrors.transporterName}
                bind:value={transporterName}
                id="transporterName"
                placeholder="Transporter Name"
              />
              {#if formErrors.transporterName}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.transporterName[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="installationEngineer">
                Installation Engineer
              </label>
              <input
                type="text"
                name="installationEngineer"
                class="form-control"
                class:is-invalid={formErrors.installationEngineer}
                bind:value={installationEngineer}
                id="installationEngineer"
                placeholder="Installation Engineer"
              />
              {#if formErrors.installationEngineer}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.installationEngineer[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="installationDate">
                Installation Date
              </label>
              <input
                type="date"
                name="installationDate"
                class="form-control"
                class:is-invalid={formErrors.installationDate}
                bind:value={installationDate}
                id="installationDate"
                placeholder="Installation Date"
              />
              {#if formErrors.installationDate}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.installationDate[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="packingType">Packing Type</label>
              <select
                name="packingType"
                id="packingType"
                class="select form-control"
                class:is-invalid={formErrors.packingType}
                bind:value={packingType}
              >
                <option value={null}>Select Packing Type</option>
                <option value="Bubble Wrap">Bubble Wrap</option>
                <option value="Wooden Packing">Wooden Packing</option>
              </select>
              {#if formErrors.packingType}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.packingType[0]}</li>
                </ul>
              {/if}
            </div>
            {#if packingType === "Wooden Packing"}
              <div>
                <label class="form-label" for="packingCharges">
                  Packing Charges
                </label>
                <select
                  name="packingCharges"
                  id="packingCharges"
                  class="select form-control"
                  class:is-invalid={formErrors.packingCharges}
                  bind:value={packingCharges}
                >
                  <option value={null}>Select Packing Charges</option>
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
                {#if formErrors.packingCharges}
                  <ul class="text-danger mt-1 text-xs capitalize">
                    <li>{formErrors.packingCharges[0]}</li>
                  </ul>
                {/if}
              </div>
            {/if}

            <div>
              <label class="form-label" for="inCoterms">In COTERMS</label>
              <select
                name="inCoterms"
                id="inCoterms"
                class="select form-control"
                class:is-invalid={formErrors.inCoterms}
                bind:value={inCoterms}
              >
                <option value={null}>Select In COTERMS</option>
                {#each inCotermsArray as inCoterm}
                  <option value={inCoterm}>{inCoterm}</option>
                {/each}
              </select>
              {#if formErrors.inCoterms}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.inCoterms[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="inCotermsBy">In COTERMS By</label>
              <select
                name="inCotermsBy"
                id="inCotermsBy"
                class="select form-control"
                class:is-invalid={formErrors.inCotermsBy}
                bind:value={inCotermsBy}
              >
                <option value={null}>Select In COTERMS By</option>
                {#if inCoterms === "Outside India"}
                  {#each inCotermsOutsideArray as inCoterm}
                    <option value={inCoterm}>{inCoterm}</option>
                  {/each}
                {:else}
                  {#each inCotermsInArray as inCoterm}
                    <option value={inCoterm}>{inCoterm}</option>
                  {/each}
                {/if}
              </select>
              {#if formErrors.inCotermsBy}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.inCotermsBy[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="paymentMethod"
                >Payment Method</label
              >
              <select
                name="paymentMethod"
                id="paymentMethod"
                class="select form-control"
                class:is-invalid={formErrors.paymentMethod}
                bind:value={paymentMethod}
              >
                <option value={null}>Select Payment Method</option>
                {#each paymentMethodArray as paymentMethod}
                  <option value={paymentMethod}>{paymentMethod}</option>
                {/each}
              </select>
              {#if formErrors.paymentMethod}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.paymentMethod[0]}</li>
                </ul>
              {/if}
            </div>

            <div class="col-span-3 border-top"></div>

            <div class="col-span-3">
              <div class="font-semibold text-black mb-2">Items :</div>
              <div>
                <div class="table-responsive mb-3">
                  <table class="w-full border table-nowrap">
                    <thead class="table-light border-bottom bg-gray-100">
                      <tr>
                        <th class="p-2">Item</th>
                        <th class="p-2"></th>
                      </tr>
                    </thead>
                    <tbody class="workorders-list-two">
                      {#each items as item, index}
                        <tr>
                          <td class="p-2">
                            <div class="input-table input-table-descripition">
                              <input
                                type="text"
                                class="form-control"
                                bind:value={item.item}
                              />
                            </div>
                          </td>
                          <td class="p-2">
                            <button
                              type="button"
                              on:click={() => removeItem(index)}
                              class="btn btn-icon btn-sm text-danger"
                            >
                              <i class="ti ti-xbox-x"></i>
                            </button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <!-- Add New -->
                <button
                  type="button"
                  on:click={() => addItem()}
                  class="text-primary"
                  style="cursor: pointer;"
                >
                  <i class="ti ti-plus me-1"></i>Add New
                </button>
              </div>
            </div>

            <div class="col-span-3">
              <label class="form-label" for="remarks">Remarks</label>
              <textarea
                name="remarks"
                id="remarks"
                class="form-control"
                class:is-invalid={formErrors.remarks}
                bind:value={remarks}
                required
                placeholder="Remarks"
              ></textarea>

              {#if formErrors.remarks}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.remarks[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-end mt-4">
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create New"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
