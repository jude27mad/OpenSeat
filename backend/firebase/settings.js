// The Firebase web app settings are public. GitHub Actions supplies the production values.
export const localSettings = {
  apiKey: 'demo-openseat',
  projectId: 'demo-openseat',
  databaseURL: 'https://demo-openseat-default-rtdb.firebaseio.com',
}

export function readSettings(json) {
  const settings = JSON.parse(json || '{}')
  if (!settings.apiKey || !settings.projectId || !settings.databaseURL) {
    throw new Error('Set OPENSEAT_FIREBASE_CONFIG to the Firebase web app configuration, including databaseURL.')
  }
  const endpoint = new URL(settings.databaseURL)
  if (endpoint.protocol !== 'https:' || !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(endpoint.hostname)) {
    throw new Error('Use the HTTPS Realtime Database URL for this project.')
  }
  return { apiKey: settings.apiKey, projectId: settings.projectId, databaseURL: endpoint.origin }
}
