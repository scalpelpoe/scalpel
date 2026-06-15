import { CHANGELOG } from '@shared/changelog'
import { getFaq } from '@shared/faq'
import { FaqItem } from './FaqItem'
import { CollapsibleSection } from '@renderer/shared/CollapsibleSection'
import { m } from '@shared/paraglide/messages.js'

export function FaqTab(): JSX.Element {
  return (
    <>
      <div className="mt-3 flex flex-col gap-3">
        {getFaq().map((section) => (
          <div key={section.section} className="flex flex-col gap-3">
            <div className="settings-section-title mt-1">{section.section}</div>
            {section.items.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}
      </div>

      {/* Changelog */}
      <section>
        <CollapsibleSection title={<span className="text-xs text-text-dim">{m.settings_changelog()}</span>}>
          <div className="mt-2 flex flex-col gap-[10px]">
            {CHANGELOG.map((entry) => (
              <div key={entry.version}>
                <div className="text-[11px] font-semibold text-accent">v{entry.version}</div>
                <ul className="mt-1 ml-4 p-0 text-[11px] text-text-dim">
                  {entry.notes.map((note, i) => (
                    <li key={i} className="mt-0.5">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </section>
    </>
  )
}
