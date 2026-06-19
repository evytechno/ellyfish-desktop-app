import Swal from "sweetalert2";

export const AUTH_REDIRECT_ERROR = "AUTH_REDIRECT";

export const errorHandle = (error) => {
    // ── Auth redirect — user is being sent to login, show nothing ─────────────
    if (error?.code === AUTH_REDIRECT_ERROR) return {};

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
        // ── HTTP status-specific messages ──────────────────────────────────────
        const status = error?.status;
        let icon  = "warning";
        let title = "Warning!";
        let text  = errData?.message ?? "Something went wrong.";
        let color = "#f59e0b";

        if (status === 403) {
            icon  = "error";
            title = "Access Denied";
            text  = "You don't have permission to perform this action.";
            color = "#dc3545";
        } else if (status === 404) {
            icon  = "info";
            title = "Not Found";
            text  = errData?.message ?? "The requested resource was not found.";
            color = "#3b82f6";
        } else if (status >= 500) {
            icon  = "error";
            title = "Server Error";
            text  = "An unexpected server error occurred. Please try again later.";
            color = "#dc3545";
        }

        Swal.fire({ icon, title, text, confirmButtonColor: color });
    }

    return fieldErrors;
};
