import { LoginPage } from './features/auth/LoginPage'
import type { LoginCredentials } from './features/auth/LoginPage'

function App() {
  function handleLogin(_credentials: LoginCredentials) {}

  function handleRegisterClick() {}

  return (
    <LoginPage onSubmit={handleLogin} onRegisterClick={handleRegisterClick} />
  )
}

export default App
