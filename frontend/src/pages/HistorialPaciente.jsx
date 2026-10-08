import Navbar from '../components/Navbar.jsx'

export default function HistorialPaciente() {
  return (
    <div className="login-viewport">
      <Navbar />
      <main style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem', color: '#f8fafc' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Mi Historial Clínico</h1>
        <p style={{ color: '#94a3b8' }}>Consultas y antecedentes registrados.</p>
      </main>
    </div>
  )
}
