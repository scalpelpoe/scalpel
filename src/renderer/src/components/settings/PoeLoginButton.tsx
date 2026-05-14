import { useEffect, useState } from 'react'
import type { AuthResult } from '../../../../shared/types'

export function PoeLoginButton(): JSX.Element {
  const [auth, setAuth] = useState<AuthResult | null>(null)

  const checkAuth = (): void => {
    window.api.poeCheckAuth().then(setAuth)
  }

  useEffect(() => {
    checkAuth()
  }, [])

  if (auth === null) return <span className="text-[11px] text-text-dim">Checking...</span>

  if (auth.loggedIn) {
    return (
      <div className="setting-box">
        <span className="value text-accent">Logged in as {auth.accountName}</span>
        <button
          className="text-[11px] text-text-dim shrink-0 ml-2 px-3 py-[5px]"
          onClick={() => {
            window.api.poeLogout().then(() => setAuth({ loggedIn: false }))
          }}
        >
          Logout
        </button>
      </div>
    )
  }

  return (
    <div className="setting-box">
      <span className="value text-text-dim">Not logged in</span>
      <button
        className="primary"
        onClick={() => {
          window.api.poeLogin().then(() => checkAuth())
        }}
      >
        Login
      </button>
    </div>
  )
}
