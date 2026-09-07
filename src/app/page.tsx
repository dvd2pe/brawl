'use client'

export default function Home() {
  return (
    <iframe
      src="/studio/index.html"
      title="Brawl Hero Studio"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'block',
      }}
    />
  )
}
