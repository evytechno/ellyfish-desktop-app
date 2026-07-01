<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  let loadingData = true;

  // Form state
  let title = "";
  let email = "";
  let mobile = "";
  let logo = null;
  let logoUrl = null;
  let favicon = null;
  let faviconUrl = null;
  let logoSmall = null;
  let logoSmallUrl = null;
  let taxItems = [
    { item: "CGST", percentage: 9, total: 0 },
    { item: "SGST", percentage: 9, total: 0 },
    { item: "IGST", percentage: 18, total: 0 },
  ];

  let locationRestrictionEnabled = false;
  let allowedIps = [];
  let allowedLocations = [];

  let loading = false;
  let errorMessage = "";

  // Field-specific error messages
  let formErrors = {};

  function handleLogoFileChange(event) {
    const fileInput = event.target;
    const selectedFile = fileInput.files[0];

    if (selectedFile) {
      logo = selectedFile;
    }
  }

  function handleFaviconFileChange(event) {
    const fileInput = event.target;
    const selectedFile = fileInput.files[0];

    if (selectedFile) {
      favicon = selectedFile;
    }
  }

  function handleLogoSmallFileChange(event) {
    const fileInput = event.target;
    const selectedFile = fileInput.files[0];

    if (selectedFile) {
      logoSmall = selectedFile;
    }
  }

  async function fetchSetting() {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.SETTING}`);

      title = data?.title;
      email = data?.email;
      mobile = data?.mobile;
      logoUrl = data?.logo;
      faviconUrl = data?.favicon;
      logoSmallUrl = data?.logoSmall;
      if (data?.taxItems) {
        taxItems = data?.taxItems;
      }

      locationRestrictionEnabled = data?.locationRestrictionEnabled ?? false;
      allowedIps = data?.allowedIps ?? [];
      allowedLocations = data?.allowedLocations ?? [];
    } catch (error) {
      errorMessage = "Failed to load setting data.";
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role != "master") {
      loadingData = false;
      loading = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => {
        window.history.back();
      });
      return;
    }
    fetchSetting();
  });

  function addIp() {
    allowedIps = [...allowedIps, ""];
  }

  function removeIp(i) {
    allowedIps = allowedIps.filter((_, idx) => idx !== i);
  }

  function addLocation() {
    allowedLocations = [
      ...allowedLocations,
      { name: "", latitude: "", longitude: "", radiusMeters: 100 },
    ];
  }

  function removeLocation(i) {
    allowedLocations = allowedLocations.filter((_, idx) => idx !== i);
  }

  function resetForm() {
    title = "";
    email = "";
    mobile = "";
    logo = null;
    logoUrl = null;
    favicon = null;
    faviconUrl = null;
    logoSmall = null;
    logoSmallUrl = null;
    taxItems = [
      { item: "CGST", percentage: 9, total: 0 },
      { item: "SGST", percentage: 9, total: 0 },
      { item: "IGST", percentage: 18, total: 0 },
    ];
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const settingPayload = new FormData();
    if (logo) {
      settingPayload.append("logo", logo);
    }
    if (favicon) {
      settingPayload.append("favicon", favicon);
    }
    if (logoSmall) {
      settingPayload.append("logoSmall", logoSmall);
    }
    settingPayload.append("title", title);
    settingPayload.append("email", email);
    settingPayload.append("mobile", mobile);
    settingPayload.append("taxItems", JSON.stringify(taxItems));

    settingPayload.append(
      "locationRestrictionEnabled",
      locationRestrictionEnabled,
    );

    settingPayload.append(
      "allowedIps",
      JSON.stringify(allowedIps.filter((ip) => ip.trim())),
    );

    settingPayload.append(
      "allowedLocations",
      JSON.stringify(
        allowedLocations.map((l) => ({
          name: l.name,
          latitude: Number(l.latitude),
          longitude: Number(l.longitude),
          radiusMeters: Number(l.radiusMeters),
        })),
      ),
    );

    try {
      const data = await authApiFetch(`${API_ROUTES.SETTING}`, {
        method: "PUT",
        data: settingPayload, // Send FormData
      });

      formErrors = {};

      Swal.fire("Success!", data.message, "success");
      resetForm();
      fetchSetting();
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

  function addTaxItem() {
    taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }];
  }

  function removeTaxItem(index) {
    taxItems = taxItems.filter((_, i) => i !== index);
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Update Setting</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">
            Update Setting
          </li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Update Setting</h5>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} class="needs-validation" novalidate>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="form-label" for="title">Title</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.title}
                type="text"
                bind:value={title}
                placeholder="Title"
                id="title"
                required
              />
              {#if formErrors.title}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.title[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="email">Email</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.email}
                type="email"
                bind:value={email}
                placeholder="email"
                id="email"
                required
              />
              {#if formErrors.email}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.email[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="mobile">Mobile</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.mobile}
                type="text"
                bind:value={mobile}
                placeholder="Mobile"
                id="mobile"
                required
              />
              {#if formErrors.mobile}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.mobile[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="attachmentFile">Logo</label>
              <input
                type="file"
                name="logo"
                class="form-control"
                accept="application/pdf,image/*"
                id="attachmentFile"
                on:change={handleLogoFileChange}
              />
              {#if logo}
                <div class="float-clear mb-2"></div>
                <p class="mb-1 fs-14 text-success">
                  <i class="ti ti-paperclip"></i>
                  {logo.name} ({(logo.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              {:else if logoUrl}
                <div class="float-clear mb-2"></div>
                <div class="">
                  <span class="border p-1 rounded hover:border-[#e41f07]">
                    <a href={ATTACHMENT_BASE_URL + logoUrl} target="_blank">
                      <i class="ti ti-link"></i>
                      Logo Url
                    </a>
                  </span>
                </div>
              {/if}

              {#if formErrors.logo}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.logo[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="favicon">Favicon</label>
              <input
                type="file"
                name="favicon"
                class="form-control"
                accept="application/pdf,image/*"
                id="favicon"
                on:change={handleFaviconFileChange}
              />
              {#if favicon}
                <div class="float-clear mb-2"></div>
                <p class="mb-1 fs-14 text-success">
                  <i class="ti ti-paperclip"></i>
                  {favicon.name} ({(favicon.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              {:else if faviconUrl}
                <div class="float-clear mb-2"></div>
                <div class="">
                  <span class="border p-1 rounded hover:border-[#e41f07]">
                    <a href={ATTACHMENT_BASE_URL + faviconUrl} target="_blank">
                      <i class="ti ti-link"></i>
                      Favicon Url
                    </a>
                  </span>
                </div>
              {/if}

              {#if formErrors.favicon}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.favicon[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="logoSmall">Logo Small</label>
              <input
                type="file"
                name="logoSmall"
                class="form-control"
                accept="application/pdf,image/*"
                id="logoSmall"
                on:change={handleLogoSmallFileChange}
              />
              {#if logoSmall}
                <div class="float-clear mb-2"></div>
                <p class="mb-1 fs-14 text-success">
                  <i class="ti ti-paperclip"></i>
                  {logoSmall.name} ({(logoSmall.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              {:else if logoSmallUrl}
                <div class="float-clear mb-2"></div>
                <div class="">
                  <span class="border p-1 rounded hover:border-[#e41f07]">
                    <a
                      href={ATTACHMENT_BASE_URL + logoSmallUrl}
                      target="_blank"
                    >
                      <i class="ti ti-link"></i>
                      Logo Small Url
                    </a>
                  </span>
                </div>
              {/if}

              {#if formErrors.logoSmall}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.logoSmall[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <div class="font-semibold text-black mb-2">Tax Items :</div>
              <div>
                <div class="table-responsive mb-3">
                  <table class="w-full border table-nowrap">
                    <thead class="table-light border-bottom bg-gray-100">
                      <tr>
                        <th class="p-2">Name</th>
                        <th class="p-2">Percentage (%)</th>
                        <th class="p-2"></th>
                      </tr>
                    </thead>
                    <tbody class="invoices-list-two">
                      {#if taxItems.length}
                        {#each taxItems as item2, index2}
                          <tr>
                            <td class="p-2">
                              <div class="input-table input-table-descripition">
                                <input
                                  type="text"
                                  class="form-control"
                                  bind:value={item2.item}
                                />
                              </div>
                            </td>
                            <td class="p-2">
                              <div>
                                <input
                                  type="number"
                                  class="form-control"
                                  bind:value={item2.percentage}
                                />
                              </div>
                            </td>
                            <td class="p-2">
                              <button
                                type="button"
                                on:click={() => removeTaxItem(index2)}
                                class="btn btn-icon btn-sm text-danger"
                              >
                                <i class="ti ti-xbox-x"></i>
                              </button>
                            </td>
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>

                <!-- Add New -->
                <button
                  type="button"
                  on:click={() => addTaxItem()}
                  class="text-primary"
                  style="cursor: pointer;"
                >
                  <i class="ti ti-plus me-1"></i>Add New
                </button>
              </div>
            </div>
            <!-- ── Location Restriction ─────────────────────────────────── -->
            <div class="col-span-3">
              <div class="border rounded-2 overflow-hidden">

                <!-- Section header + toggle -->
                <div class="d-flex align-items-center justify-content-between p-3 bg-light border-bottom">
                  <div class="d-flex align-items-center gap-2">
                    <span class="d-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10 text-primary"
                      style="width:32px;height:32px;">
                      <i class="ti ti-map-pin fs-16"></i>
                    </span>
                    <div>
                      <h6 class="mb-0 fw-semibold">Location Restriction</h6>
                      <small class="text-muted">Restrict login to specific IP addresses or GPS locations</small>
                    </div>
                  </div>

                  <!-- Toggle switch -->
                  <div class="d-flex align-items-center gap-2">
                    <span class="text-sm text-muted">{locationRestrictionEnabled ? 'Enabled' : 'Disabled'}</span>
                    <div
                      class="position-relative"
                      style="width:44px;height:24px;cursor:pointer;"
                      on:click={() => (locationRestrictionEnabled = !locationRestrictionEnabled)}
                    >
                      <input type="checkbox" bind:checked={locationRestrictionEnabled} class="d-none" />
                      <div
                        class="rounded-pill w-100 h-100 transition"
                        style="background:{locationRestrictionEnabled ? '#4f46e5' : '#dee2e6'};"
                      ></div>
                      <div
                        class="position-absolute rounded-circle bg-white shadow-sm"
                        style="width:18px;height:18px;top:3px;transition:left .2s;
                               left:{locationRestrictionEnabled ? '23px' : '3px'};"
                      ></div>
                    </div>
                  </div>
                </div>

                {#if locationRestrictionEnabled}
                  <div class="p-3 d-flex flex-column gap-4">

                    <!-- ── Allowed IPs ── -->
                    <div>
                      <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="d-flex align-items-center gap-2">
                          <i class="ti ti-network text-primary fs-16"></i>
                          <span class="fw-semibold text-sm">Allowed IP Addresses / CIDR Ranges</span>
                        </div>
                        <button
                          type="button"
                          on:click={addIp}
                          class="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                        >
                          <i class="ti ti-plus fs-13"></i> Add IP
                        </button>
                      </div>

                      {#if allowedIps.length === 0}
                        <div class="border border-dashed rounded-2 py-3 text-center text-muted text-sm">
                          <i class="ti ti-network-off fs-20 d-block mb-1"></i>
                          No IP addresses added — all IPs allowed
                        </div>
                      {:else}
                        <div class="d-flex flex-column gap-2">
                          {#each allowedIps as ip, i}
                            <div class="d-flex align-items-center gap-2">
                              <span class="d-flex align-items-center justify-content-center bg-light rounded px-2"
                                style="height:38px;min-width:32px;">
                                <i class="ti ti-server text-muted fs-14"></i>
                              </span>
                              <input
                                type="text"
                                class="form-control form-control-sm flex-1"
                                bind:value={allowedIps[i]}
                                on:input={() => (allowedIps = [...allowedIps])}
                                placeholder="e.g. 192.168.1.10 or 192.168.1.0/24"
                              />
                              <button
                                type="button"
                                on:click={() => removeIp(i)}
                                class="btn btn-sm btn-icon text-danger"
                                title="Remove"
                              >
                                <i class="ti ti-trash fs-15"></i>
                              </button>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      <p class="text-muted mt-2 mb-0" style="font-size:11px;">
                        <i class="ti ti-info-circle me-1"></i>
                        Supports single IP (192.168.1.5) or CIDR range (192.168.1.0/24)
                      </p>
                    </div>

                    <hr class="my-0" />

                    <!-- ── Allowed GPS Locations ── -->
                    <div>
                      <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="d-flex align-items-center gap-2">
                          <i class="ti ti-map-pin-check text-success fs-16"></i>
                          <span class="fw-semibold text-sm">Allowed GPS Locations</span>
                        </div>
                        <button
                          type="button"
                          on:click={addLocation}
                          class="btn btn-sm btn-outline-success d-flex align-items-center gap-1"
                        >
                          <i class="ti ti-plus fs-13"></i> Add Location
                        </button>
                      </div>

                      {#if allowedLocations.length === 0}
                        <div class="border border-dashed rounded-2 py-3 text-center text-muted text-sm">
                          <i class="ti ti-map-off fs-20 d-block mb-1"></i>
                          No GPS locations added
                        </div>
                      {:else}
                        <div class="d-flex flex-column gap-3">
                          {#each allowedLocations as loc, i}
                            <div class="border rounded-2 p-3 position-relative bg-light bg-opacity-50">

                              <!-- Location # badge + remove -->
                              <div class="d-flex align-items-center justify-content-between mb-3">
                                <span class="badge bg-success bg-opacity-10 text-success fw-semibold">
                                  <i class="ti ti-map-pin me-1"></i>
                                  Location {i + 1}
                                </span>
                                <button
                                  type="button"
                                  on:click={() => removeLocation(i)}
                                  class="btn btn-sm btn-icon text-danger"
                                  title="Remove location"
                                >
                                  <i class="ti ti-trash fs-15"></i>
                                </button>
                              </div>

                              <div class="d-flex align-items-end gap-2 flex-wrap">
                                <!-- Name -->
                                <div class="flex-fill" style="min-width:140px;">
                                  <label class="form-label text-xs fw-medium text-muted mb-1">
                                    <i class="ti ti-tag me-1"></i>Name
                                  </label>
                                  <input
                                    type="text"
                                    class="form-control form-control-sm"
                                    bind:value={loc.name}
                                    placeholder="e.g. Office"
                                  />
                                </div>

                                <!-- Latitude -->
                                <div class="flex-fill" style="min-width:120px;">
                                  <label class="form-label text-xs fw-medium text-muted mb-1">
                                    <i class="ti ti-gps me-1"></i>Latitude
                                  </label>
                                  <input
                                    type="number"
                                    step="any"
                                    class="form-control form-control-sm font-monospace"
                                    bind:value={loc.latitude}
                                    placeholder="18.5204"
                                  />
                                </div>

                                <!-- Longitude -->
                                <div class="flex-fill" style="min-width:120px;">
                                  <label class="form-label text-xs fw-medium text-muted mb-1">
                                    <i class="ti ti-gps me-1"></i>Longitude
                                  </label>
                                  <input
                                    type="number"
                                    step="any"
                                    class="form-control form-control-sm font-monospace"
                                    bind:value={loc.longitude}
                                    placeholder="73.8567"
                                  />
                                </div>

                                <!-- Radius -->
                                <div style="min-width:110px;">
                                  <label class="form-label text-xs fw-medium text-muted mb-1">
                                    <i class="ti ti-radar me-1"></i>Radius (m)
                                  </label>
                                  <input
                                    type="number"
                                    class="form-control form-control-sm"
                                    bind:value={loc.radiusMeters}
                                    min="10"
                                    max="10000"
                                    placeholder="200"
                                  />
                                </div>
                              </div>

                              <!-- Google Maps hint -->
                              {#if loc.latitude && loc.longitude}
                                <div class="mt-2">
                                  <a
                                    href="https://www.google.com/maps?q={loc.latitude},{loc.longitude}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-primary text-xs d-inline-flex align-items-center gap-1"
                                  >
                                    <i class="ti ti-map-2 fs-13"></i>
                                    Preview on Google Maps
                                  </a>
                                </div>
                              {/if}

                            </div>
                          {/each}
                        </div>
                      {/if}

                      <p class="text-muted mt-2 mb-0" style="font-size:11px;">
                        <i class="ti ti-info-circle me-1"></i>
                        Get coordinates from
                        <a href="https://maps.google.com" target="_blank" class="text-primary">Google Maps</a>
                        → right-click on location → copy lat/lng
                      </p>
                    </div>

                  </div>
                {/if}

              </div>
            </div>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
