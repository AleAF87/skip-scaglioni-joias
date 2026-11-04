import React, { createContext, useContext, useState, useRef, useCallback } from 'react'

interface PdvGuardContextType {
  isCartDirty: boolean
  setIsCartDirty: (dirty: boolean) => void
  requestLeave: (onConfirm: () => void) => void
  registerLeaveHandler: (handler: ((onConfirm: () => void) => void) | null) => void
}

const PdvGuardContext = createContext<PdvGuardContextType>({
  isCartDirty: false,
  setIsCartDirty: () => {},
  requestLeave: (onConfirm) => onConfirm(),
  registerLeaveHandler: () => {},
})

export const usePdvGuard = () => useContext(PdvGuardContext)

export const PdvGuardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCartDirty, setIsCartDirty] = useState(false)
  const leaveHandlerRef = useRef<((onConfirm: () => void) => void) | null>(null)

  const registerLeaveHandler = useCallback((handler: ((onConfirm: () => void) => void) | null) => {
    leaveHandlerRef.current = handler
  }, [])

  const requestLeave = useCallback((onConfirm: () => void) => {
    if (leaveHandlerRef.current) {
      leaveHandlerRef.current(onConfirm)
    } else {
      onConfirm()
    }
  }, [])

  return (
    <PdvGuardContext.Provider
      value={{
        isCartDirty,
        setIsCartDirty,
        requestLeave,
        registerLeaveHandler,
      }}
    >
      {children}
    </PdvGuardContext.Provider>
  )
}
