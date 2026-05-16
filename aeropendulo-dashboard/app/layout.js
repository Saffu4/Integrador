import './globals.css'

export const metadata = {
  title: 'Aeropéndulo — Dashboard',
  description: 'Telemetría en tiempo real del sistema aeropéndulo PID',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
