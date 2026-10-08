import Navbar from '../components/Navbar.jsx'

export default function PortalMedico() {
  return (
    <div className="login-viewport">
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem', color: '#f8fafc' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Portal del Especialista</h1>
        <p style={{ color: '#94a3b8' }}>Cola de derivaciones y disponibilidad de guardia.</p>
      </main>
    </div>
  )
}
