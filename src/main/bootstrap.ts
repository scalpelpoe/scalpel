import { app } from 'electron'

const CAPTURE_PROCESS_FLAG = '--scalpel-capture-process'

if (process.argv.includes(CAPTURE_PROCESS_FLAG)) {
  void import('./screen-capture/capture-process-child')
    .then(({ runCaptureProcessChild }) => runCaptureProcessChild())
    .catch((caught) => {
      console.error('[capture-process] startup failed', caught)
      app.exit(1)
    })
} else {
  void import('./index').catch((caught) => {
    console.error('[main] startup failed', caught)
    app.exit(1)
  })
}
