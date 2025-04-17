import { useEffect, useState } from 'react'

type AnimateInOutProps = {
  show: boolean
  children: React.ReactNode
  className?: string
  durationInMs?: number
  durationOutMs?: number
}

export default function AnimateInOut({
  show,
  children,
  className = '',
  durationInMs = 300,
  durationOutMs = 200,
}: AnimateInOutProps) {
  const [shouldRender, setShouldRender] = useState(show)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    if (show) {
      setShouldRender(true)
      setIsAnimatingOut(false)
    } else if (shouldRender) {
      setIsAnimatingOut(true)
      const timeout = setTimeout(() => {
        setShouldRender(false)
        setIsAnimatingOut(false)
      }, durationOutMs)
      return () => clearTimeout(timeout)
    }
  }, [show, shouldRender, durationOutMs])

  if (!shouldRender) return null

  return (
    <div
      className={`transition-all ${isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'
        } ${className}`}
    >
      {children}
    </div>
  )
}
