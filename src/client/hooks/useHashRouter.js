import { useState, useEffect, useCallback } from "react"

const VALID_ROUTES = [
  "create-order",
  "history",
  "products",
  "inventory",
  "stock",
  "debt",
  "stats",
  "print-diagnostic",
]

const DEFAULT_ROUTE = "create-order"

function getHashRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "").trim()
  const route = hash.split("?")[0]
  if (!route || !VALID_ROUTES.includes(route)) return DEFAULT_ROUTE
  return route
}

/**
 * Hash-based SPA router hook.
 * - Reads current route from `window.location.hash`
 * - Listens to `hashchange` to sync state
 * - `navigate(path)` updates hash → triggers re-render
 * - F5 / refresh keeps the current page
 */
export function useHashRouter() {
  const [currentPath, setCurrentPath] = useState(() => getHashRoute())

  useEffect(() => {
    // Set initial hash if missing
    const current = getHashRoute()
    if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = current
    }
    setCurrentPath(current)

    const handleHashChange = () => {
      setCurrentPath(getHashRoute())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  const navigate = useCallback((path) => {
    const route = VALID_ROUTES.includes(path) ? path : DEFAULT_ROUTE
    window.location.hash = route
    // State will be updated by hashchange listener
  }, [])

  return { currentPath, navigate }
}
