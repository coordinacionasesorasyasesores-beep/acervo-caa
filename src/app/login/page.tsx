import { LoginForm } from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-bosque px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="titular bg-gradient-to-r from-oro via-oro-claro to-oro bg-clip-text font-serif text-5xl font-normal text-transparent">
            Acervo
          </h1>
          <p className="mt-2 text-sm text-niebla">
            Coordinación de Asesoras y Asesores · ISSSTE
          </p>
        </div>

        <LoginForm
          errorInicial={
            error === 'enlace'
              ? 'Ese enlace ya se usó o venció. Pide uno nuevo.'
              : undefined
          }
        />
      </div>
    </div>
  )
}
