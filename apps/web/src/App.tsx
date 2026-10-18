import { useState } from 'react'
import { LoginPage } from './features/auth/LoginPage'
import type { LoginCredentials } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import type { RegisteredUser } from './features/auth/registerApi'

type AuthScreen = 'login' | 'register'

function App() {
  const [screen, setScreen] = useState<AuthScreen>('login')

  // Quem acabou de criar a conta. Guardado só para o login já vir preenchido;
  // não é sessão — autenticar é o próximo passo, ainda não existe.
  const [registered, setRegistered] = useState<RegisteredUser>()

  function handleLogin(_credentials: LoginCredentials) {}

  function handleRegistered(user: RegisteredUser) {
    setRegistered(user)
    setScreen('login')
  }

  if (screen === 'register') {
    return (
      <RegisterPage
        onRegistered={handleRegistered}
        onLoginClick={() => setScreen('login')}
      />
    )
  }

  return (
    <LoginPage
      onSubmit={handleLogin}
      onRegisterClick={() => {
        // Sair do login limpa o aviso: ele se refere ao cadastro que acabou de
        // acontecer, e não deve reaparecer numa segunda visita à tela.
        setRegistered(undefined)
        setScreen('register')
      }}
      notice={
        registered && `Conta criada, ${registered.name}. Entre para continuar.`
      }
      initialEmail={registered?.email}
    />
  )
}

export default App
