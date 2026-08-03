<script>
  import { convertDate, shortenFileName, fileIcon } from "../../utils/index.js";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  export let order;
  export let maskAuthorName;
  export let addAttachment;
  export let deleteAttachment;
  export let openAttachment;
  export let openImageLightbox;

  let aTitle = "";
  let link = "";
  let files = [];
  let isDragging = false;
  let loading = false;
  let formErrors = {};

  function handleFileChange(event) {
    const selected = Array.from(event.target.files);
    if (selected.length > 0) files = [...files, ...selected];
  }

  function handleDragOver(event) { event.preventDefault(); isDragging = true; }
  function handleDragLeave() { isDragging = false; }
  function handleDrop(event) {
    event.preventDefault(); isDragging = false;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) files = [...files, ...dropped];
  }

  function removeFile(f) { files = files.filter((x) => x !== f); }

  async function handleAddAttachment(e) {
    e.preventDefault();
    formErrors = {};
    loading = true;
    try {
      await addAttachment({ aTitle, link, files });
      aTitle = ""; link = ""; files = [];
      const $ = window.jQuery || window.$;
      if ($) { $("#new_file").modal("hide"); }
    } catch {}
    finally { loading = false; }
  }
</script>

<!-- Files Tab -->
<div class="tab-pane active show" id="tab_2">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Files</h5>
      <div class="d-inline-flex align-items-center">
        <button href="#new_file" data-bs-toggle="modal" data-bs-target="#new_file" class="link-primary fw-medium">
          <i class="ti ti-circle-plus me-1"></i>Add New
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="notes-activity">
        {#if order?.orderAttachments?.length}
          {#each order.orderAttachments as attachment}
            <div class="card mb-3 relative">
              {#if attachment?.deletedAt}
                <div class="ribbon ribbon-top-left"><span class="bg-red-500">Deleted</span></div>
              {/if}
              <div class="card-body">
                {#if !attachment?.deletedAt}
                  <div class="absolute top-5 right-5">
                    <button on:click={deleteAttachment(attachment?.id)} class="bg-red-500 text-white text-md px-1.5 py-1 rounded">
                      <i class="ti ti-trash"></i>
                    </button>
                  </div>
                {/if}
                <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-2 pb-2">
                  <div class="d-inline-flex align-items-center mb-2">
                    <span class="avatar avatar-md me-2 flex-shrink-0">
                      <img src="/assets/img/profiles/user.png" alt="img" />
                    </span>
                    <div>
                      <h6 class="fw-medium fs-14 mb-1">{maskAuthorName(attachment?.user)}</h6>
                      <p class="mb-0 fs-13">
                        {attachment?.createdAt && convertDate(attachment?.createdAt, {
                          timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit", hour12: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                {#if attachment?.title}
                  <h5 class="fw-medium fs-14 mb-1">{attachment?.title}</h5>
                {/if}
                {#if attachment?.link}
                  <p class="mb-0">Attachment Link : <a href={attachment?.link} target="_blank">{attachment?.link}</a></p>
                {/if}
                {#if attachment?.file}
                  {@const fi = fileIcon(null, attachment?.fileName ?? attachment?.file)}
                  <div class="row" class:mt-3={attachment?.title || attachment?.link}>
                    <div class="col-xxl-4 col-lg-5">
                      <div class="card mb-0" role="button" tabindex="0" aria-label="Open attachment"
                        on:click={() => openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName)}
                        on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName); }}
                        style="cursor:pointer;">
                        <div class="card-body p-2">
                          <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                            <div class="d-flex align-items-center me-3">
                              <span class="avatar {fi.bg} me-2"><i class="ti {fi.icon} fs-20"></i></span>
                              <div>
                                <h6 class="fw-medium fs-14 mb-1 trank" title={attachment?.fileName}>
                                  {shortenFileName(attachment?.fileName)}
                                </h6>
                              </div>
                            </div>
                            <button on:click|stopPropagation={() => openAttachment(ATTACHMENT_BASE_URL + attachment?.file, null, attachment?.fileName)}
                              class="avatar avatar-xs rounded-circle bg-light text-dark" title="Open">
                              <i class="ti ti-external-link"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                {/if}
                {#if attachment?.files}
                  {@const attachImgUrls = attachment.files
                    .filter((f) => f?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f?.originalName ?? ""))
                    .map((f) => ATTACHMENT_BASE_URL + f.url)}
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" class:mt-3={attachment?.title || attachment?.link}>
                    {#each attachment?.files as file}
                      {@const fi = fileIcon(file?.mimeType, file?.originalName)}
                      {@const isImg = file?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file?.originalName ?? "")}
                      {@const imgIdx = attachImgUrls.indexOf(ATTACHMENT_BASE_URL + file?.url)}
                      <div class="card mb-0" role="button" tabindex="0" aria-label="Open attachment"
                        on:click={() => isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName)}
                        on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName); }}
                        style="cursor:pointer;">
                        <div class="card-body p-2">
                          <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                            <div class="d-flex align-items-center me-3">
                              {#if isImg}
                                <span class="avatar border me-2">
                                  <img src={ATTACHMENT_BASE_URL + file?.url} alt={file?.originalName} class="object-contain" />
                                </span>
                              {:else}
                                <span class="avatar {fi.bg} me-2"><i class="ti {fi.icon} fs-20"></i></span>
                              {/if}
                              <div>
                                <h6 class="fw-medium lg:fs-14 fs-12 mb-1 trank" title={file?.originalName}>
                                  {shortenFileName(file?.originalName)}
                                </h6>
                                <p class="mb-0 fs-12 md:fs-10">{(file.size / 1024).toFixed(2)} KB</p>
                              </div>
                            </div>
                            <button on:click|stopPropagation={() => isImg ? openImageLightbox(attachImgUrls, imgIdx) : openAttachment(ATTACHMENT_BASE_URL + file?.url, file?.mimeType, file?.originalName)}
                              class="avatar avatar-xs rounded-circle bg-light text-dark" title="Open">
                              <i class="ti ti-external-link"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <div>No attachments found.</div>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Add Attachment Modal -->
<div class="modal fade" id="new_file" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Add New Attachment</h5>
        <button type="button" class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <form on:submit={handleAddAttachment} class="needs-validation space-y-4" novalidate>
        <div class="modal-body space-y-4">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="attachTitle">Title <span class="text-danger">*</span></label>
              <input type="text" name="title" class="form-control" class:is-invalid={formErrors.title}
                bind:value={aTitle} required id="attachTitle" placeholder="Title" />
              {#if formErrors.title}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.title[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="attachLink">Link</label>
              <input type="text" name="link" class="form-control" bind:value={link} id="attachLink" placeholder="Link" />
            </div>
            <div>
              <label class="form-label" for="attachmentFile">Attachment</label>
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="file-upload drag-file w-100 d-flex border shadow align-items-center justify-content-center flex-column p-3 transition-all"
                class:bg-primary={isDragging} class:bg-light={!isDragging}
                style="border-style: dashed !important; border-color: {isDragging ? '#4f46e5' : '#dee2e6'} !important;"
                on:dragover={handleDragOver} on:dragleave={handleDragLeave} on:drop={handleDrop}>
                <span class="upload-img d-block mb-1">
                  <i class="ti ti-folder-open fs-16 {isDragging ? 'text-white' : 'text-primary'}"></i>
                </span>
                <p class="mb-0 fs-14 {isDragging ? 'text-white' : 'text-dark'}">
                  {#if isDragging}Release to upload files{:else}Drop your files here or <a href="#browse" class="text-decoration-underline text-primary">browse</a>{/if}
                </p>
                <input type="file" name="file" accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  id="attachmentFile" multiple on:change={handleFileChange} />
                <p class="fs-13 mb-0 {isDragging ? 'text-white' : ''}">Maximum limit: 10 Files</p>
              </div>
              {#if formErrors.file}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.file[0]}</li></ul>
              {/if}
            </div>
          </div>
          {#if files && files.length}
            <div class="grid grid-cols-2 gap-3">
              {#each files as file}
                <div class="card mb-0">
                  <div class="card-body p-2">
                    <div class="d-flex align-items-center justify-content-between flex-wrap row-gap-3">
                      <div class="d-flex align-items-center me-3">
                        {#if file.type && file.type.startsWith("image")}
                          <span class="avatar border me-2">
                            <img src={URL.createObjectURL(file)} alt={file?.name} class="object-contain" />
                          </span>
                        {:else}
                          <span class="avatar bg-success me-2"><i class="ti ti-file-spreadsheet fs-20"></i></span>
                        {/if}
                        <div>
                          <h6 class="fw-medium fs-12 mb-1 trank" title={file?.name}>{shortenFileName(file?.name, 4, 8)}</h6>
                          <p class="mb-0 fs-10">{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                      <button type="button" class="avatar avatar-xs rounded-circle bg-danger text-white" on:click={() => removeFile(file)}>
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          <div class="modal-footer">
            <a class="btn btn-light" href="#cancel" data-bs-dismiss="modal">Cancel</a>
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
