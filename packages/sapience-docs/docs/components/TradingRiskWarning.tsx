// Avoid static importing Vocs components during SSR; dynamically load on client
import { useEffect, useState, type ComponentType } from 'react'

type TradingRiskWarningProps = {
  className?: string
}

export default function TradingRiskWarning({ className }: TradingRiskWarningProps) {
  const [CalloutCmp, setCalloutCmp] = useState<ComponentType<any> | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const mod = await import('vocs/components')
        if (mounted && mod?.Callout) setCalloutCmp(() => mod.Callout)
      } catch {
        // no-op; fallback styles will be used
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    mounted && CalloutCmp ? (
      <>
        <style>{`
          .trading-risk-warning svg {
            transform: translateY(2px);
          }
        `}</style>
        <CalloutCmp className={`trading-risk-warning ${className ?? ''}`} type="warning">
          Check your local regulations. Start with small amounts and monitor performance. Use a dedicated wallet for your agent and never commit your private key to source control.
        </CalloutCmp>
      </>
    ) : null
  )
}

