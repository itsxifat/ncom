import { env } from '@/lib/env'
import { NewStoreForm } from './NewStoreForm'

export default async function NewStorePage() {
  return <NewStoreForm rootDomain={env.ROOT_DOMAIN} />
}
