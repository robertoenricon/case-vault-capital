import { useState } from 'react'
import { LoginPage } from './features/auth/LoginPage'
import type { LoginCredentials } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import type { RegisterData } from './features/auth/registerValidation'

type AuthScreen = 'login' | 'register'

function App() {
  const [screen, setScreen] = useState<AuthScreen>('login')

  function handleLogin(_credentials: LoginCredentials) {}

  function handleRegister(_data: RegisterData) {}

  if (screen === 'register') {
    return (
      <RegisterPage
        onSubmit={handleRegister}
        onLoginClick={() => setScreen('login')}
      />
    )
  }

  return (
    <LoginPage
      onSubmit={handleLogin}
      onRegisterClick={() => setScreen('register')}
    />
  )
}

export default App
