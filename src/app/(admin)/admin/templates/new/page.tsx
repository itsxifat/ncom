import { listTemplateCategories } from '@/server/services/templateService'
import { NewTemplateForm } from './NewTemplateForm'

export default async function NewTemplatePage() {
  const categories = await listTemplateCategories()
  return <NewTemplateForm categories={categories} />
}
