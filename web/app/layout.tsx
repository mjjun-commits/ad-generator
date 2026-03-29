import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ad Generator',
  description: 'Generate ad variants JSON for Figma plugin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, sans-serif', background: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  )
}
