import { useEffect, useState } from 'react'
import type { AuthResult } from '../../../shared/types'

/** Trade-site auth state. Checks login on mount; `login`/`logout` perform the
 *  action then refresh. `loggedIn` is the derived boolean for consumers that
 *  only need yes/no; `auth` is the full result (null while the first check is in
 *  flight) for consumers that show the account name. */
export function useAuth(): {
  auth: AuthResult | null
  loggedIn: boolean
  checkAuth: () => void
  login: () => Promise<void>
  logout: () => Promise<void>
} {
  const [auth, setAuth] = useState<AuthResult | null>(null)

  useEffect(() => {
    window.api.poeCheckAuth().then(setAuth)
  }, [])

  const checkAuth = (): void => {
    window.api.poeCheckAuth().then(setAuth)
  }
  const login = (): Promise<void> => window.api.poeLogin().then(checkAuth)
  const logout = (): Promise<void> => window.api.poeLogout().then(() => setAuth({ loggedIn: false }))

  return { auth, loggedIn: auth?.loggedIn ?? false, checkAuth, login, logout }
}
