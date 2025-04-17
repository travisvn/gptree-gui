import { useEffect, useState } from 'react'

type FadeInOutProps = {
  show: boolean
  children: React.ReactNode
  className?: string
  animation?: 'fade' | 'slide'
  durationInMs?: number
  durationOutMs?: number
}

export default function FadeInOut({
  show,
  children,
  className = '',
  animation = 'fade',
  durationInMs = 300,
  durationOutMs = 200,
}: FadeInOutProps) {
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

  const animationClass =
    animation === 'slide'
      ? isAnimatingOut
        ? 'animate-slide-fade-out'
        : 'animate-slide-fade-in'
      : isAnimatingOut
        ? 'animate-fade-out-scale'
        : 'animate-fade-in-scale'

  return (
    <div className={`${animationClass} ${className}`}>
      {children}
    </div>
  )
}
