import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Repositorio de Investigaciones — CAA',
  description:
    'Acervo de investigaciones y documentos de trabajo de la Coordinación de Asesoras y Asesores del ISSSTE.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  )
}
