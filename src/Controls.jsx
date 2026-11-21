import React, { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  Share2,
  Copy,
  Check,
  QrCode,
  Download,
  Radio,
} from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from './components/ui/button'
import { floor, label, tables } from './floor.js'
import { scanCount } from './model.js'
import { roomUrl } from './session.js'
export function Modal({ title, description, onClose, children }) {
  // Dialogs here open without a trigger, so focus is returned by hand.
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null)
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(e) => {
            const back = opener.current
            if (back?.isConnected && back !== document.body) {
              e.preventDefault()
              back.focus({ preventScroll: true })
            }
          }}
        >
          <div className="dialog-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function QRDialog({ room, place, onClose }) {
  const url = roomUrl(room, place?.id, !!place),
    [image, setImage] = useState(''),
    [copied, setCopied] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let keep = true
    QRCode.toDataURL(url, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#143c2cff', light: '#ffffffff' },
    })
      .then((v) => {
        if (keep) setImage(v)
      })
      .catch(() =>
        setError(
          'Could not generate the code. The link below also opens this spot.',
        ),
      )
    return () => {
      keep = false
    }
  }, [url])
  return (
    <Modal
      title={place ? label(place.id) + ' QR code' : 'Share this map'}
      description={
        place
          ? room.id.startsWith('floor')
            ? 'This is the code for the ' +
              (place.section === 'tables' ? 'table' : 'seat') +
              '. Scanning it opens check-in for this spot.'
            : 'Scan with another phone to try checking in here.'
          : 'Send this link to a friend, or open it on another phone.'
      }
      onClose={onClose}
    >
      <div className="qr-frame">
        {image ? (
          <img
            src={image}
            width="216"
            height="216"
            alt={'QR code for ' + (place ? label(place.id) : 'this map')}
          />
        ) : (
          <QrCode />
        )}
      </div>
      <label className="field-label">
        Shareable link
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
      <div className="btn-row">
        {!place && typeof navigator !== 'undefined' && navigator.share && (
          <Button
            onClick={() =>
              navigator.share({ title: 'OpenSeat · SLC ' + floor.name, url }).catch(() => {})
            }
          >
            <Share2 />
            Share
          </Button>
        )}
        <Button
          variant={!place && typeof navigator !== 'undefined' && navigator.share ? 'outline' : 'default'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
            } catch {
              setError('Select and copy the link above.')
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        {image && (
          <Button variant="outline" asChild>
            <a
              href={image}
              download={'OpenSeat-' + (place ? floor.name.replace(' ', '') + '-' + place.id : room.id) + '-QR.png'}
            >
              <Download />
              Save QR
            </a>
          </Button>
        )}
      </div>
      {place && !room.id.startsWith('floor') && (
        <a className="text-btn open-checkin" href={url} onClick={onClose}>
          Open check-in on this device
        </a>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}
export function ScannerControls({
  demo,
  onClose,
  onBridge,
  bridge,
}) {
  const [section, setSection] = useState(tables.length ? 'tables' : 'individuals'),
    [raw, setRaw] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [showConnection, setShowConnection] = useState(true),
    [token, setToken] = useState(''),
    [topic, setTopic] = useState(''),
    [key, setKey] = useState('')
  const ref = useRef(true)
  useEffect(() => {
    ref.current = true
    return () => {
      ref.current = false
    }
  }, [])
  async function run(action) {
    setBusy(true)
    setMessage('')
    try {
      const msg = await action()
      if (ref.current) setMessage(msg)
    } catch (e) {
      if (ref.current) setMessage(e.message)
    } finally {
      if (ref.current) setBusy(false)
    }
  }
  return (
    <Modal
      title="Bluetooth scanner"
      description="Connect your scanner to an area on this floor."
      onClose={onClose}
    >
      <label className="field-label">
        Scanner section
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          {tables.length > 0 && <option value="tables">Round-table area</option>}
          <option value="individuals">Individual-seat area</option>
        </select>
      </label>
      <p>
        Only identifiers seen at −75 dBm or stronger count in a scan. The
        map receives the total for that section.
      </p>
      <details>
        <summary>Check a saved BLE2MQTT scan</summary>
        <label className="field-label">
          Scan JSON
          <textarea
            rows="3"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste one scan array"
          />
        </label>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(async () => {
              let rows
              try {
                rows = JSON.parse(raw)
              } catch {
                throw Error('Paste a valid JSON scan array.')
              }
              const n = scanCount(rows)
              setRaw('')
              return (
                n +
                ' unique devices at or above −75 dBm. Historical check only.'
              )
            })
          }
        >
          Count locally
        </Button>
      </details>
      <button
        className="text-btn"
        onClick={() => setShowConnection(!showConnection)}
      >
        <Radio size={14} />
        {showConnection
          ? 'Hide connection settings'
          : 'Connect BLE2MQTT via flespi'}
      </button>
      {showConnection && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await onBridge({ token, topic, section, feedKey: key })
              setToken('')
              setKey('')
              return 'Scanner subscription started.'
            })
          }}
        >
          <label className="field-label">
            flespi read token
            <input
              required
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <label className="field-label">
            Scanner MQTT topic
            <input
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Exact topic configured in BLE2MQTT"
            />
          </label>
          {!demo && (
            <label className="field-label">
              OpenSeat operator key
              <input
                required
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
          )}
          <Button disabled={busy} type="submit">
            Connect scanner
          </Button>
        </form>
      )}
      {bridge && <p role="status">{bridge}</p>}
      {message && (
        <p role="status" className="feedback">
          {message}
        </p>
      )}
    </Modal>
  )
}
