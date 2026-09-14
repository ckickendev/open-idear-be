const PayOS = require("@payos/node");

let payosInstance = null;

/**
 * Get the singleton payOS SDK instance.
 * Requires PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY in env.
 */
function getPayOS() {
    if (!payosInstance) {
        const clientId = process.env.PAYOS_CLIENT_ID;
        const apiKey = process.env.PAYOS_API_KEY;
        const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

        if (!clientId || !apiKey || !checksumKey) {
            console.warn(
                "[payOS] Missing credentials. Set PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY in .env"
            );
            return null;
        }

        payosInstance = new PayOS(clientId, apiKey, checksumKey);
        console.log("[payOS] SDK initialized successfully");
    }
    return payosInstance;
}

module.exports = { getPayOS };
