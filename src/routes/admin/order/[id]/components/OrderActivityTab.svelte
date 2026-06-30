<script>
  import { convertDate, newDateFormate, normalizeTypes } from "./utils.js";

  export let order;
  export let currentUser;
  export let activeDate;
  export let toggleAccordion;
</script>

<div class="tab-pane active show" id="tab_1">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Activities</h5>
    </div>
    <div class="card-body">
      {#if order?.groupedActivities?.length}
        {#each order?.groupedActivities as dateActivity}
          <button
            on:click={() => toggleAccordion(dateActivity?.date)}
            class="flex items-center justify-between gap-2 mb-3 w-full border-bottom pb-2"
          >
            <div class="badge badge-soft-info border-0">
              <i class="ti ti-calendar-check me-1"></i>
              {dateActivity?.date && convertDate(dateActivity?.date, {
                timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
              })}
            </div>
            <div>
              <i class={`ti ${activeDate === dateActivity?.date ? "ti-chevron-up" : "ti-chevron-down"}`}></i>
            </div>
          </button>

          {#if activeDate === dateActivity?.date}
            {#each dateActivity?.activities as activity}
              <div class="card border shadow-none mb-3">
                <div class="card-body p-3">
                  <div class="d-flex align-items-center flex-lg-nowrap flex-wrap row-gap-2">
                    {#if activity.title == "Order Created"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600">
                        <i class="ti ti-plus fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Updated"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-blue-500 text-blue-600">
                        <i class="ti ti-edit fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Status Changed" || activity.title == "Status Changed"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-gray-500 text-gray-600">
                        <i class="ti ti-arrows-shuffle fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Deleted"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600">
                        <i class="ti ti-trash fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Chat Added"}
                      {@const nt = normalizeTypes(activity.data?.type)[0] ?? "Other"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2
                        {nt === 'Call' ? 'bg-blue-500 text-blue-600' :
                         nt === 'WhatsApp' ? 'bg-green-500 text-green-600' :
                         nt === 'Email' ? 'bg-yellow-500 text-yellow-600' :
                         'bg-cyan-500 text-cyan-600'}">
                        <i class="fs-20
                          {nt === 'Call' ? 'ti ti-phone' :
                           nt === 'WhatsApp' ? 'ti ti-brand-whatsapp' :
                           nt === 'Email' ? 'ti ti-mail' :
                           'ti ti-message'}"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Chat Deleted"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-cyan-500 text-cyan-600">
                        <i class="ti ti-message-off fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Attachment Added"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600">
                        <i class="ti ti-paperclip fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Attachment Deleted"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-indigo-500 text-indigo-600">
                        <i class="ti ti-link-off fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Client Added"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-purple-500 text-purple-600">
                        <i class="ti ti-user-plus fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Client Deleted"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-red-500 text-red-600">
                        <i class="ti ti-user-cancel fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Assigned to User" || activity.title == "Assigned Users Updated"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600">
                        <i class="ti ti-user-pin fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Payment Added"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-green-500 text-green-600">
                        <i class="ti ti-credit-card fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Reminder Added"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600">
                        <i class="ti ti-alarm-snooze fs-20"></i>
                      </span>
                    {/if}
                    {#if activity.title == "Order Reminder Deleted"}
                      <span class="avatar avatar-md flex-shrink-0 rounded me-2 bg-yellow-500 text-yellow-600">
                        <i class="ti ti-alarm-off fs-20"></i>
                      </span>
                    {/if}
                    <div>
                      <h6 class="fw-medium fs-14 mb-1">
                        {#if currentUser?.subRole === 'telecaller' || currentUser?.subRole === 'tech' || currentUser?.subRole === 'tech_helper'}
                          {activity?.title}
                        {:else}
                          {activity?.description}
                        {/if}
                      </h6>
                      {#if activity.title == "Order Chat Added"}
                        <p class="mb-1 d-flex align-items-center gap-1 flex-wrap">
                          {#each normalizeTypes(activity?.data?.type) as nt}
                            <span class="badge {nt === 'Call' ? 'bg-primary' : nt === 'WhatsApp' ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:10px;">
                              {#if nt === 'Call'}<i class="ti ti-phone me-1"></i>{/if}
                              {#if nt === 'WhatsApp'}<i class="ti ti-brand-whatsapp me-1"></i>{/if}
                              {#if nt === 'Email'}<i class="ti ti-mail me-1"></i>{/if}
                              {nt}
                            </span>
                          {/each}
                          {activity?.data?.message}
                        </p>
                      {/if}
                      {#if activity.title == "Order Attachment Added"}
                        <p class="mb-1">
                          {#await Promise.resolve() then _}
                            {(() => {
                              let desc = "";
                              const data = activity.data;
                              const fileList = data?.files || [];
                              if (data?.title) desc += ` Title: "${data.title}".`;
                              if (fileList.length) {
                                desc += ` File Names:`;
                                fileList.forEach((f, i) => {
                                  if (f?.originalName) desc += ` "${f.originalName}"${i < fileList.length - 1 ? "," : "."}`;
                                });
                              }
                              if (data?.link) desc += ` Link: ${data.link}.`;
                              return desc;
                            })()}
                          {/await}
                        </p>
                      {/if}
                      {#if activity.title == "Order Reminder Added"}
                        <p class="mb-1">
                          {#await Promise.resolve() then _}
                            {(() => {
                              let desc = "";
                              const data = activity.data;
                              if (data?.reminderTime) {
                                const formattedTime = new Date(data.reminderTime).toLocaleString("en-IN", {
                                  day: "2-digit", month: "short", year: "numeric",
                                  hour: "2-digit", minute: "2-digit", hour12: true,
                                });
                                desc += `Reminder Time: ${formattedTime}. `;
                              }
                              if (data?.message) desc += ` Message: ${data.message}.`;
                              return desc;
                            })()}
                          {/await}
                        </p>
                      {/if}
                      <p class="mb-0">
                        {newDateFormate(activity?.createdAt, {
                          timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        {/each}
      {:else}
        <div>No activities found.</div>
      {/if}
    </div>
  </div>
</div>
