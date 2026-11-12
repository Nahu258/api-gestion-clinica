import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
// Tipografías servidas desde el propio sitio (funcionan sin salir a internet)
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
// Tipografías de marca (manual de identidad): Sora para títulos y logo, Inter para texto
import '@fontsource-variable/sora'
import '@fontsource-variable/inter'
import './styles/consola.css'
import './index.css'
import './styles/admin.css'
import './styles/publico.css'
import './styles/tablero.css'
import './styles/landing.css'
import './styles/print.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
