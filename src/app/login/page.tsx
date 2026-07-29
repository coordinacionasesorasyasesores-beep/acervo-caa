import { LoginForm } from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">
            Repositorio de Investigaciones
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
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
