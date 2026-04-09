<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  let loadingData = true;

  // Form state
  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let logo = null;
  let gstNumber = "";
  let address = "";
  let bankName = "";
  let accountHolderName = "";
  let accountNumber = "";
  let ifscCode = "";
  let branchAddress = "";
  let description = "";

  let loading = false;
  let errorMessage = "";

  // Field-specific error messages
  let formErrors = {};

  function handleFileChange(event) {
    const fileInput = event.target;
    const selectedFile = fileInput.files[0];

    if (selectedFile) {
      logo = selectedFile;
    }
  }
  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
    loadingData = true;

    if (currentUser?.role === "user") {
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
    setTimeout(() => {
      loadingData = false;
    }, 500);
  });

  async function handleSubmit(e) {
    e.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const companyPayload = new FormData();

    if (logo) {
      companyPayload.append("logo", logo);
    }
    companyPayload.append("name", name);
    companyPayload.append("email", email);
    companyPayload.append("mobile", mobile);
    companyPayload.append("whatsapp", whatsapp);
    companyPayload.append("gstNumber", gstNumber);
    companyPayload.append("address", address);
    companyPayload.append("bankName", bankName);
    companyPayload.append("accountHolderName", accountHolderName);
    companyPayload.append("ifscCode", ifscCode);
    companyPayload.append("branchAddress", branchAddress);
    companyPayload.append("description", description);
    if (accountNumber || accountNumber != "") {
      companyPayload.append("accountNumber", accountNumber);
    }

    try {
      const data = await authApiFetch(API_ROUTES.COMPANY, {
        method: "POST",
        data: companyPayload, // Send FormData
      });

      // Reset Form
      name = "";
      email = "";
      mobile = "";
      whatsapp = "";
      logo = null;
      gstNumber = "";
      address = "";
      bankName = "";
      accountHolderName = "";
      accountNumber = "";
      ifscCode = "";
      branchAddress = "";
      description = "";
      formErrors = {};

      Swal.fire("Success!", data.message, "success");
      goto("/admin/company");
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
        console.error("Unexpected error:", error);
      }
    } finally {
      console.log("formErrors:", formErrors);
      loading = false;
    }
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Add Company</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item">
            <a href="/admin/company">Companies</a>
          </li>
          <li class="breadcrumb-item active" aria-current="page">
            Add Company
          </li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Add Company</h5>
        <a href="/admin/company" class="btn btn-primary">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Company List
        </a>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} class="needs-validation" novalidate>
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2">
              <label class="form-label" for="name">Name</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.name}
                type="text"
                bind:value={name}
                placeholder="Name"
                id="name"
                required
              />
              {#if formErrors.name}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.name[0]}</li>
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
              <label class="form-label" for="whatsapp">Whatsapp</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.whatsapp}
                type="text"
                bind:value={whatsapp}
                placeholder="Whatsapp"
                id="whatsapp"
                required
              />
              {#if formErrors.whatsapp}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.whatsapp[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="gstNumber">GST Number</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.gstNumber}
                type="text"
                bind:value={gstNumber}
                placeholder="GST Number"
                id="gstNumber"
                required
              />
              {#if formErrors.gstNumber}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.gstNumber[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="priceTerms">Logo</label>
              <input
                type="file"
                name="logo"
                class="form-control"
                accept="application/pdf,image/*"
                id="attachmentFile"
                on:change={handleFileChange}
              />
              {#if logo}
                <p class="mb-1 fs-14 text-success">
                  <i class="ti ti-paperclip"></i>
                  {logo.name} ({(logo.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              {/if}

              {#if formErrors.logo}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.logo[0]}</li>
                </ul>
              {/if}
            </div>

            <div class="col-span-2">
              <label class="form-label" for="address">Address</label>
              <textarea
                name="address"
                id="address"
                class="form-control"
                class:is-invalid={formErrors.address}
                bind:value={address}
                required
                placeholder="Address"
              ></textarea>
              {#if formErrors.address}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.address[0]}</li>
                </ul>
              {/if}
            </div>
            <div class="col-span-3 border-top pt-3">
              <h6>Bank Details</h6>
            </div>

            <div>
              <label class="form-label" for="bankName">Bank Name</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.bankName}
                type="text"
                bind:value={bankName}
                placeholder="Bank Name"
                id="bankName"
                required
              />
              {#if formErrors.bankName}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.bankName[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="accountHolderName"
                >Account Holder Name</label
              >
              <input
                class="form-control"
                class:is-invalid={formErrors.accountHolderName}
                type="text"
                bind:value={accountHolderName}
                placeholder="Account Holder Name"
                id="accountHolderName"
                required
              />
              {#if formErrors.accountHolderName}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.accountHolderName[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="accountNumber"
                >Account Number</label
              >
              <input
                class="form-control"
                class:is-invalid={formErrors.accountNumber}
                type="text"
                bind:value={accountNumber}
                placeholder="Account Number"
                id="accountNumber"
                required
              />
              {#if formErrors.accountNumber}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.accountNumber[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="ifscCode">IFSC Code</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.ifscCode}
                type="text"
                bind:value={ifscCode}
                placeholder="IFSC Code"
                id="ifscCode"
                required
              />
              {#if formErrors.ifscCode}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.ifscCode[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" for="branchAddress"
                >Branch Address</label
              >
              <input
                class="form-control"
                class:is-invalid={formErrors.branchAddress}
                type="text"
                bind:value={branchAddress}
                placeholder="Branch Address"
                id="branchAddress"
                required
              />
              {#if formErrors.branchAddress}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.branchAddress[0]}</li>
                </ul>
              {/if}
            </div>

            <div class="col-span-3">
              <label class="form-label" for="description">Description</label>
              <textarea
                name="description"
                id="description"
                class="form-control"
                class:is-invalid={formErrors.description}
                bind:value={description}
                required
                placeholder="Description"
              ></textarea>
              {#if formErrors.description}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.description[0]}</li>
                </ul>
              {/if}
            </div>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Submiting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
