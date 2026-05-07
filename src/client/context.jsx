import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

const UserContext = createContext(null)
const USER_STORAGE_KEY = "soanhang.auth.user"
export const DEVICE_TOKEN_SCOPE = "base-soanhang-congno"
export const DEVICE_TOKEN_STORAGE_KEY = `soanhang.auth.device_token:${DEVICE_TOKEN_SCOPE}`
const USER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const user = parsed?.user || null
    if (!user) {
      localStorage.removeItem(USER_STORAGE_KEY)
      return null
    }
    return user
  } catch (e) {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function UserProvider({ children }) {
  const [user, setUserState] = useState(() => readStoredUser())

  const setUser = useCallback((nextUser) => {
    setUserState(nextUser || null)
    if (nextUser) {
      try {
        localStorage.setItem(
          USER_STORAGE_KEY,
          JSON.stringify({ user: nextUser }),
        )
      } catch (e) {
        // ignore storage failures (private mode, blocked storage)
      }
    } else {
      try {
        localStorage.removeItem(USER_STORAGE_KEY)
      } catch (e) {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY)
      if (!raw) {
        setUserState(null)
      }
    } catch (e) {
      try {
        localStorage.removeItem(USER_STORAGE_KEY)
      } catch (err) {
        // ignore
      }
      setUserState(null)
    }
  }, [user])

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout: () => setUser(null),
    }),
    [user, setUser],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) {
    throw new Error("useUser must be used within <UserProvider>")
  }
  return ctx
}
