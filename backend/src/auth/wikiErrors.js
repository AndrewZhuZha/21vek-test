/**
 * @param {number} status
 * @param {string} message
 * @returns {Error & { status: number }}
 */
export function createWikiError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}
