import { Check } from 'lucide-react'

export const STEPS = ['소스', '선택', '타겟', '결과'] as const
export type Step = (typeof STEPS)[number]

export function Stepper({ current }: { current: Step }) {
  const index = STEPS.indexOf(current)

  return (
    <div className="stepper">
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'contents' }}>
          {i > 0 && <span className="step-line" />}
          <div className={`stepper-item${i === index ? ' current' : ''}`}>
            <span className={`step-dot${i <= index ? ' done' : ''}`}>
              {i < index ? <Check size={12} /> : i + 1}
            </span>
            <span>{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
