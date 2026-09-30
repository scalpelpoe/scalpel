import logo from '../assets/scalpel-logo-96.png'

/** The Scalpel home page's bottom bar (web/public/site.css), as on the static legal pages. */
export function SiteFooter(): JSX.Element {
  return (
    <footer className="sc-footer">
      <div className="sc-footer-bar">
        <div className="sc-footer-brand">
          <img src={logo} alt="" />
          <span className="sc-footer-name">Scalpel</span>
          <span className="sc-dim" style={{ fontSize: 12 }}>
            · Path of Exile's first fourth-party tool.
          </span>
        </div>
        <div className="sc-footer-links">
          <a className="sc-navlink" href="/">
            Scalpel Stream
          </a>
          <a className="sc-navlink" href="/privacy">
            Privacy
          </a>
          <a className="sc-navlink" href="/terms">
            Terms
          </a>
          <a className="sc-navlink" href="https://github.com/scalpelpoe/scalpel">
            GitHub
          </a>
        </div>
      </div>
      <div className="sc-legal">
        Free under AGPL-3.0. Not affiliated with Grinding Gear Games or Twitch. Path of Exile is a trademark of Grinding
        Gear Games; game art is used under the fan content policy.
      </div>
    </footer>
  )
}
