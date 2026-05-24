import { useAuth } from '../../shared/use-auth'

export function PoeLoginButton(): JSX.Element {
  const { auth, login, logout } = useAuth()

  if (auth === null) return <span className="text-[11px] text-text-dim">Checking...</span>

  if (auth.loggedIn) {
    return (
      <div className="setting-box">
        <span className="value text-accent">Logged in as {auth.accountName}</span>
        <button
          className="text-[11px] text-text-dim shrink-0 ml-2 px-3 py-[5px]"
          onClick={() => {
            logout()
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
          login()
        }}
      >
        Login
      </button>
    </div>
  )
}
