import jQuery from "jquery";

/** Close a Bootstrap modal by selector (e.g. "#edit_component"). */
export function closeModalManual(id) {
  const $ = jQuery;
  $(id).removeClass("show d-block");
  $(".modal-backdrop").removeClass("show");
  setTimeout(() => {
    $(".modal-backdrop").remove();
    $(id).removeClass("d-block");
    $("body").removeClass("modal-open");
    $("body").css({ overflow: "", paddingRight: "" });
  }, 300);
}

/** Close the order edit offcanvas (#offcanvas_add). */
export function closeOffcanvas() {
  const $ = jQuery;
  $("#offcanvas_add").removeClass("show");
  $(".offcanvas-backdrop").remove();
  $("body").css({ overflow: "", paddingRight: "" });
}
