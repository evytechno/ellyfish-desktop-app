<script>
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import QuillEditor from "$lib/components/QuillEditor.svelte";

  export let order;
  export let categories = [];
  export let handleSubmit;

  // Two-way bindings for form fields
  export let title = "";
  export let category = "";
  export let orderDate = null;
  export let startDate = null;
  export let deadlineDate = null;
  export let price = null;
  export let currency = "INR";
  export let priceTerms = null;
  export let source = null;
  export let description = "";
  export let workOrderNumber = "";
  export let formErrors = {};
  export let loading = false;
  export let errorMessage = "";

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  const sources = ["Whatsapp", "Website", "Mail"];
</script>

<div class="offcanvas offcanvas-end offcanvas-large" tabindex="-1" id="offcanvas_add">
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">Update Order</h5>
    <button type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas" aria-label="Close">
    </button>
  </div>
  <div class="offcanvas-body">
    <form on:submit={handleSubmit} class="needs-validation space-y-4" novalidate>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="form-label" for="editTitle">Title <span class="text-danger">*</span></label>
          <input type="text" name="title" class="form-control" class:is-invalid={formErrors.title}
            bind:value={title} required id="editTitle" placeholder="Title" />
          {#if formErrors.title}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.title[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editCategory">Category</label>
          {#key categories.length}
            <TypeableSelect id="editCategory" options={categories} grouped={true}
              value={category != "" ? category : null} placeholder="Select Category"
              on:change={(e) => (category = e.detail)} />
          {/key}
          {#if formErrors.category}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.category[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editWorkOrderNumber">Work Order Number</label>
          <input type="text" name="workOrderNumber" class="form-control"
            class:is-invalid={formErrors.workOrderNumber} bind:value={workOrderNumber}
            id="editWorkOrderNumber" placeholder="Work Order Number" />
          {#if formErrors.workOrderNumber}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.workOrderNumber[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editOrderDate">Order Date</label>
          <input type="date" name="orderDate" class="form-control"
            class:is-invalid={formErrors.orderDate} bind:value={orderDate} id="editOrderDate" />
          {#if formErrors.orderDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.orderDate[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editStartDate">Start Date</label>
          <input type="date" name="startDate" class="form-control"
            class:is-invalid={formErrors.startDate} bind:value={startDate} id="editStartDate" />
          {#if formErrors.startDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.startDate[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editDeadlineDate">Deadline Date</label>
          <input type="date" name="deadlineDate" class="form-control"
            class:is-invalid={formErrors.deadlineDate} bind:value={deadlineDate} id="editDeadlineDate" />
          {#if formErrors.deadlineDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.deadlineDate[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editPrice">Price</label>
          <div class="!flex items-center rounded-md bg-white !p-0 !pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-indigo-600 form-control"
            class:is-invalid={formErrors.price} class:border={!formErrors.price}>
            <div class="shrink-0 text-base text-gray-500 select-none sm:text-sm/6">
              {currencies.find((c) => c.code === currency)?.symbol}
            </div>
            <input id="editPrice" type="number" name="price" bind:value={price} placeholder="0.00"
              class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base placeholder:text-gray-400 focus:outline-none sm:text-sm/6" />
            <div class="grid shrink-0 grid-cols-1 focus-within:relative">
              <select id="editCurrency" name="currency" bind:value={currency} aria-label="Currency"
                class="col-start-1 row-start-1 w-full border-l appearance-none rounded-md rounded-l-[0px] py-1.5 pr-7 pl-3 text-base text-gray-500 placeholder:text-gray-400 focus:outline-0 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                {#each currencies as c}
                  <option value={c.code}>{c.code}</option>
                {/each}
              </select>
              <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true"
                class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4">
                <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                  clip-rule="evenodd" fill-rule="evenodd" />
              </svg>
            </div>
          </div>
          {#if formErrors.price}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.price[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editPriceTerms">Price Terms</label>
          <input type="text" name="priceTerms" class="form-control"
            class:is-invalid={formErrors.priceTerms} bind:value={priceTerms} id="editPriceTerms" placeholder="Price Terms" />
          {#if formErrors.priceTerms}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.priceTerms[0]}</li></ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="editSource">Source</label>
          <TypeableSelect id="editSource" options={sources} value={source}
            placeholder="Select Source" on:change={(e) => (source = e.detail)} />
          {#if formErrors.source}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.source[0]}</li></ul>
          {/if}
        </div>
      </div>
      <div class="col-span-2">
        <label class="form-label" for="editDescription">Description</label>
        <div class:is-invalid={formErrors.description} style="border-radius:6px;">
          <QuillEditor bind:value={description} placeholder="Description" height="180px"
            on:change={(e) => (description = e.detail)} />
        </div>
        {#if formErrors.description}
          <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.description[0]}</li></ul>
        {/if}
      </div>
      <div class="d-flex align-items-center justify-content-end mt-4">
        <button type="button" data-bs-dismiss="offcanvas" class="btn btn-light me-2">Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update Now"}
        </button>
      </div>
    </form>
  </div>
</div>
