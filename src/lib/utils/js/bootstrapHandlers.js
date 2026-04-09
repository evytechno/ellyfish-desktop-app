// src/lib/utils/js/bootstrapHandlers.js

export function setupBootstrapHandlers() {

	$(document).on("click", "[data-bs-toggle='modal']", function (e) {
		e.preventDefault();

		const target = $(this).data("bs-target");
		const modal = $(target);

		modal.addClass("d-block");
		setTimeout(() => {
			modal.addClass("show");
		}, 10);

		if (!$(".modal-backdrop").length) {
			$('<div class="modal-backdrop fade"></div>').appendTo(document.body);
			setTimeout(() => {
				$(".modal-backdrop").addClass("show");
			}, 10);
		}

		$("body").addClass("modal-open");
		$("body").css({ overflow: "hidden", paddingRight: "15px" });
	});

	function closeModal(modal) {
		modal.removeClass("show");
		$(".modal-backdrop").removeClass("show");

		setTimeout(() => {
			modal.removeClass("d-block");
			$(".modal-backdrop").remove();
			$("body").removeClass("modal-open");
			$("body").css({ overflow: "", paddingRight: "" });
		}, 300);
	}

	$(document).on(
		"click",
		".modal .btn-close, .modal .btn-secondary,[data-bs-dismiss='modal']",
		function () {
			const modal = $(this).closest(".modal");
			closeModal(modal);
		}
	);

}
