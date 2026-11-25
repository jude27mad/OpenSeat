let storedProfile

function localProfile(uid) {
  const key = 'openseat.visitor.id'
  function readOrCreate() {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    localStorage.setItem(key, uid)
    return uid
  }
  return navigator.locks ? navigator.locks.request(key, readOrCreate) : readOrCreate()
}

// Two fresh tabs can sign in to Firebase at the same time. IndexedDB creates
// this store once across tabs, so both use the first identity for counting.
export function visitorProfile(uid) {
  if (!storedProfile) {
    storedProfile = new Promise((resolve, reject) => {
      const open = indexedDB.open('openseat.visitor', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('profile').put(uid, 'id')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const get = db.transaction('profile').objectStore('profile').get('id')
        get.onsuccess = () => { db.close(); resolve(get.result) }
        get.onerror = () => { db.close(); reject(get.error) }
      }
    }).catch(() => localProfile(uid)).catch(() => null)
  }
  return storedProfile.then((profile) => profile || uid)
}
