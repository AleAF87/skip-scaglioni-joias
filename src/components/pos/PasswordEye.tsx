import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface PasswordEyeProps {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  autoComplete?: string
  className?: string
  disabled?: boolean
  onFocus?: () => void
  onBlur?: () => void
  name?: string
  required?: boolean
}

/**
 * Campo de senha com botão "olho" para mostrar/ocultar o valor.
 * Usado em: LoginPage, UserEditModal (admin) e UserProfile (senha atual/nova/confirmar).
 */
export function PasswordEye({
  value,
  onChange,
  id,
  placeholder,
  autoComplete = 'current-password',
  className,
  disabled,
  onFocus,
  onBlur,
  name,
  required,
}: PasswordEyeProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#8C8275] hover:text-[#7A5C2E] focus:outline-none focus:ring-1 focus:ring-[#C6A664]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default PasswordEye
