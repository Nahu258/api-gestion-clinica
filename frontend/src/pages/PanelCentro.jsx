import Navbar from '../components/Navbar.jsx'

export default function PanelCentro() {
  return (
    <div className="login-viewport">
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem', color: '#f8fafc' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Panel de Guardia del Centro</h1>
        <p style={{ color: '#94a3b8' }}>Bandeja de solicitudes entrantes y derivaciones.</p>
      </main>
    </div>
  )
}
