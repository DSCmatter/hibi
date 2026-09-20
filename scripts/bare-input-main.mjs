import { isAbsolute } from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'

const fixture = process.argv
  .find((argument) => argument.startsWith('--fixture='))
  ?.slice('--fixture='.length)
if (!fixture || !isAbsolute(fixture))
  throw new Error(
    'Pass --fixture=ABSOLUTE_HTML_PATH to the engine-only benchmark.',
  )

app
  .whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null)
    const testing = app.commandLine.hasSwitch('hibi-test')
    const window = new BrowserWindow({
      width: 1000,
      height: 720,
      minWidth: 480,
      minHeight: 360,
      show: false,
      focusable: !testing,
      title: 'Editor engine benchmark',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      ...(process.platform === 'darwin'
        ? { trafficLightPosition: { x: 12, y: 11 } }
        : { titleBarOverlay: true, autoHideMenuBar: true }),
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    })
    window.once('ready-to-show', () => {
      if (testing) window.showInactive()
      else window.show()
    })
    app.on('window-all-closed', () => app.quit())
    await window.loadFile(fixture)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
