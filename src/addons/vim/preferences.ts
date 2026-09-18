export function vimPreferences() {
  return {
    insert: localStorage.getItem('vim:insert') === 'true',
    status: localStorage.getItem('vim:status') !== 'false',
    config: localStorage.getItem('vim:config') === 'true',
  }
}
