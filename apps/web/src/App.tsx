import { useState } from 'react'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import type { RegisteredUser } from './features/auth/registerApi'
import { clearSession, loadSession, saveSession } from './features/auth/session'
import type { Session } from './features/auth/session'
import { DashboardPage } from './features/leagues/DashboardPage'

type AuthScreen = 'login' | 'register'

function App() {
  const [screen, setScreen] = useState<AuthScreen>('login')

  // Sessão lida uma única vez, na montagem: quem recarregou a página continua
  // logado. É `useState` com inicializador (e não `useEffect`) para a primeira
  // renderização já sair com a tela certa, sem piscar o login.
  const [session, setSession] = useState<Session | undefined>(loadSession)

  // Quem acabou de criar a conta. Guardado só para o login já vir preenchido.
  const [registered, setRegistered] = useState<RegisteredUser>()

  function handleAuthenticated(authenticated: Session) {
    // O estado manda na tela; o localStorage é só o que sobrevive ao recarregar.
    setSession(authenticated)
    saveSession(authenticated)
    setRegistered(undefined)
  }

  function handleLogout() {
    setSession(undefined)
    clearSession()
    setScreen('login')
  }

  if (session) {
    return <DashboardPage user={session.user} onLogout={handleLogout} />
  }

  if (screen === 'register') {
    return (
      <RegisterPage
        onRegistered={(user: RegisteredUser) => {
          setRegistered(user)
          setScreen('login')
        }}
        onLoginClick={() => setScreen('login')}
      />
    )
  }

  return (
    <LoginPage
      onAuthenticated={handleAuthenticated}
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
