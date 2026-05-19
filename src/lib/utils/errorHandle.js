import Swal from "sweetalert2";

export const errorHandle = (error) => {
    // ── Network / timeout errors ───────────────────────────────────────────────
    if (error?.isNetworkError || error?.status === 0) {
        const title = error?.isTimeout ? "Request Timed Out" : "Server Unreachable";
        const text  = error?.data?.message
            ?? (error?.isTimeout
                ? "The request took too long. Your connection may be slow — please try again."
                : "Could not connect to the server. Please check your connection.");
        Swal.fire({
            icon:               "error",
            title,
            text,
            confirmButtonColor: "#dc3545",
        });
        return {};
    }

    // ── Validation / field errors (NestJS array format) ───────────────────────
    const errData    = error?.data;
    const fieldErrors = {};

    if (Array.isArray(errData?.message)) {
        for (const item of errData.message) {
            const property    = item.property;
            const constraints = item.constraints;
            if (property && constraints) {
                fieldErrors[property] = Array.isArray(constraints)
                    ? constraints
                    : Object.values(constraints);
            }
        }
    } else {
        // ── Generic server error ───────────────────────────────────────────────
        Swal.fire({
            icon:               "warning",
            title:              "Warning!",
            text:               errData?.message ?? "Something went wrong.",
            confirmButtonColor: "#f59e0b",
        });
    }

    return fieldErrors;
};
