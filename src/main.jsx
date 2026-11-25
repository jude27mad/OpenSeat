import { renderSite } from './SiteAccess.jsx'
import './style.css'
import App from './App.jsx'
import { applyTheme } from './theme.js'
applyTheme()
renderSite(App)
