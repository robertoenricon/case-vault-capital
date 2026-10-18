import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Field } from '../../components/Field'
import { describedBy } from '../../components/describedBy'
import type { League } from './leaguesApi'
import {
  EMPTY_CREATE_LEAGUE_VALUES,
  LEAGUE_RULES,
  hasErrors,
  toCreateLeagueData,
  todayAsInputValue,
  validateCreateLeagueForm,
} from './createLeagueValidation'
import type {
  CreateLeagueFieldName,
  CreateLeagueFormValues,
} from './createLeagueValidation'
import { useCreateLeague } from './useCreateLeague'
import '../auth/authForm.css'
import './CreateLeagueModal.css'

type CreateLeagueModalProps = {
  /** Token da sessão: a rota de criar liga é protegida. */
  accessToken: string
  /** Chamado quando a liga já existe no banco, com o que a API devolveu. */
  onCreated: (league: League) => void
  onClose: () => void
}

/**
 * Modal de criação de liga: nome e período.
 *
 * Usa o `<dialog>` nativo com `showModal()`, e não uma `div` com overlay: foco
 * preso no modal, Esc e fundo inerte vêm do navegador, sem recriar nada disso à
 * mão. Quem monta e desmonta é o dashboard — este componente só avisa que
 * acabou.
 *
 * O período vai para a API como **dia** (`AAAA-MM-DD`) mais o fuso do
 * navegador; os instantes de início e fim quem calcula é o backend.
 */
export function CreateLeagueModal({
  accessToken,
  onCreated,
  onClose,
}: CreateLeagueModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // A requisição e seus estados moram no hook; aqui só se decide o que mostrar.
  const { submit, submitting, error: requestError } = useCreateLeague(
    accessToken,
    onCreated,
  )

  const [values, setValues] = useState<CreateLeagueFormValues>(
    EMPTY_CREATE_LEAGUE_VALUES,
  )
  const [touched, setTouched] = useState<
    Partial<Record<CreateLeagueFieldName, boolean>>
  >({})
  const [submitTried, setSubmitTried] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // A checagem de `open` existe porque o StrictMode roda o efeito duas vezes
    // em desenvolvimento, e `showModal()` num dialog já aberto estoura.
    if (!dialog.open) dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const errors = validateCreateLeagueForm(values)

  // Hoje no fuso de quem está na tela: limita o seletor de data nos dois campos.
  const today = todayAsInputValue()

  // Erro aparece só depois de o campo ser tocado, ou depois de uma tentativa de envio.
  function visibleError(field: CreateLeagueFieldName) {
    return submitTried || touched[field] ? errors[field] : undefined
  }

  function handleChange(field: CreateLeagueFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function handleBlur(field: CreateLeagueFieldName) {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitTried(true)

    // Validação do cliente é só para dar resposta imediata: o backend valida
    // tudo de novo, e é dele que vem a palavra final.
    if (hasErrors(errors)) return

    void submit(toCreateLeagueData(values))
  }

  const nameError = visibleError('name')
  const startDateError = visibleError('startDate')
  const endDateError = visibleError('endDate')

  return (
    <dialog
      className="league-modal"
      ref={dialogRef}
      aria-labelledby="create-league-title"
      onCancel={(event) => {
        // Esc sai pelo mesmo caminho do botão Cancelar. Sem o `preventDefault`,
        // o navegador fecharia o dialog e o componente continuaria montado —
        // invisível e impossível de reabrir.
        event.preventDefault()
        if (!submitting) onClose()
      }}
    >
      <form className="league-modal__form" onSubmit={handleSubmit} noValidate>
        <header>
          <h2 className="league-modal__title" id="create-league-title">
            Criar liga
          </h2>
          <p className="league-modal__subtitle">
            Dê um nome e escolha o período da disputa. Você já entra na liga como
            participante.
          </p>
        </header>

        <Field id="league-name" label="Nome da liga" error={nameError}>
          <input
            className="field__input"
            id="league-name"
            name="name"
            type="text"
            value={values.name}
            onChange={(event) => handleChange('name', event.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder="Liga dos Amigos"
            maxLength={LEAGUE_RULES.name.maxLength}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy('league-name', nameError)}
            autoFocus
            required
          />
        </Field>

        <div className="league-modal__period">
          <Field id="league-start" label="Início" error={startDateError}>
            <input
              className="field__input"
              id="league-start"
              name="startDate"
              type="date"
              value={values.startDate}
              onChange={(event) => handleChange('startDate', event.target.value)}
              onBlur={() => handleBlur('startDate')}
              // Limita o seletor do navegador; a regra mesmo é do backend.
              min={today}
              aria-invalid={startDateError ? true : undefined}
              aria-describedby={describedBy('league-start', startDateError)}
              required
            />
          </Field>

          <Field id="league-end" label="Fim" error={endDateError}>
            <input
              className="field__input"
              id="league-end"
              name="endDate"
              type="date"
              value={values.endDate}
              onChange={(event) => handleChange('endDate', event.target.value)}
              onBlur={() => handleBlur('endDate')}
              // Antes de escolher o início, o mínimo é hoje.
              min={values.startDate || today}
              aria-invalid={endDateError ? true : undefined}
              aria-describedby={describedBy('league-end', endDateError)}
              required
            />
          </Field>
        </div>

        <p className="field__hint">
          A liga vale o dia inteiro: começa 00:00 do início e termina 23:59 do
          fim.
        </p>

        {/* Erro que veio do servidor (regra de período, sessão expirada, API
            fora do ar). Fica junto dos botões porque é a resposta ao clique. */}
        {requestError && (
          <p className="form__alert form__alert--error" role="alert">
            {requestError}
          </p>
        )}

        <div className="league-modal__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={submitting}
          >
            {submitting ? 'Criando liga…' : 'Criar liga'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
