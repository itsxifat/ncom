import { NewPageForm } from './NewPageForm'

export default async function NewPagePage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params

  return <NewPageForm storeId={storeId} />
}
