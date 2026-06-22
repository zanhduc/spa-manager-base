/**
 * TempIdResolver
 *
 * Resolves Optimistic UI race conditions where a child API call relies on
 * the REAL ID from a parent API call that hasn't finished yet.
 */

const resolutionMap = new Map();
const pendingResolvers = new Map();

export const TempIdResolver = {
  /**
   * Register a mapping from a TEMP ID to a REAL ID.
   * @param {string} tempId 
   * @param {string} realId 
   */
  resolve(tempId, realId) {
    if (!tempId || !realId || !tempId.startsWith("TEMP-")) return;
    resolutionMap.set(tempId, realId);
    
    if (pendingResolvers.has(tempId)) {
      const resolvers = pendingResolvers.get(tempId);
      resolvers.forEach((resolveFn) => resolveFn(realId));
      pendingResolvers.delete(tempId);
    }
  },

  /**
   * Wait for a TEMP ID to be resolved.
   * If it's already resolved, returns the REAL ID immediately.
   * If not, waits up to timeoutMs (default 15s).
   * @param {string} tempId 
   * @param {number} timeoutMs 
   * @returns {Promise<string>} The REAL ID, or throws if timeout
   */
  async waitFor(tempId, timeoutMs = 15000) {
    if (!tempId || !tempId.startsWith("TEMP-")) return tempId;
    if (resolutionMap.has(tempId)) {
      return resolutionMap.get(tempId);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingResolvers.has(tempId)) {
          const resolvers = pendingResolvers.get(tempId);
          pendingResolvers.set(tempId, resolvers.filter(r => r !== resolve));
        }
        reject(new Error(`Timeout waiting for real ID of ${tempId}`));
      }, timeoutMs);

      const resolveWrapper = (realId) => {
        clearTimeout(timeout);
        resolve(realId);
      };

      if (!pendingResolvers.has(tempId)) {
        pendingResolvers.set(tempId, []);
      }
      pendingResolvers.get(tempId).push(resolveWrapper);
    });
  },

  /**
   * Rewrite an object's properties by resolving any TEMP IDs.
   * Currently only specifically checks properties that could hold the ID.
   * @param {Object} payload 
   */
  async resolvePayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    
    if (Array.isArray(payload)) {
      return Promise.all(payload.map(item => this.resolvePayload(item)));
    }

    const newPayload = { ...payload };
    const idFields = ["maPhien", "maLichHen", "maTienTrinh", "maDon", "maDaoTao"];
    
    for (const field of idFields) {
      const val = newPayload[field];
      if (typeof val === "string" && val.startsWith("TEMP-")) {
        try {
          newPayload[field] = await this.waitFor(val);
        } catch (error) {
          console.warn(`[TempIdResolver] Failed to resolve ${field}: ${val}`);
          // Allow it to pass through to the backend (where it will fail), 
          // to preserve original behavior on timeout.
        }
      }
    }

    // Special case for arrays (e.g. updates)
    if (Array.isArray(newPayload.updates)) {
      newPayload.updates = await Promise.all(
        newPayload.updates.map(item => this.resolvePayload(item))
      );
    }
    
    return newPayload;
  }
};
