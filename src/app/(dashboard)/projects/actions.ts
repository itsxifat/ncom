'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import {
  createProject,
  deleteProject,
  duplicateProject,
  updateProject,
} from '@/server/services/projectService'
import { createPage, deletePage } from '@/server/services/pageService'
import {
  createProjectFromTemplate,
  createPageFromTemplate,
} from '@/server/services/templateService'
import {
  createProjectSchema,
  updateProjectSchema,
} from '@/lib/validation/project'
import { createPageSchema } from '@/lib/validation/page'

export type FormActionState = { error?: string } | undefined

export async function createProjectAction(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    subdomain: formData.get('subdomain') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  let project
  try {
    project = await createProject(organization.id, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export async function createProjectFromTemplateAction(
  templateId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    subdomain: formData.get('subdomain') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  let project
  try {
    project = await createProjectFromTemplate(organization.id, {
      ...parsed.data,
      templateId,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export async function updateProjectAction(
  projectId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = updateProjectSchema.safeParse({
    name: formData.get('name') || undefined,
    subdomain: formData.get('subdomain') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await updateProject(organization.id, projectId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/settings`)
  return { error: undefined }
}

export async function deleteProjectAction(projectId: string) {
  const { organization } = await getActiveOrganization()
  await deleteProject(organization.id, projectId)
  revalidatePath('/projects')
}

export async function duplicateProjectAction(projectId: string) {
  const { organization } = await getActiveOrganization()
  await duplicateProject(organization.id, projectId)
  revalidatePath('/projects')
}

export async function createPageAction(
  projectId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createPageSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await createPage(organization.id, projectId, parsed.data)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}

export async function createPageFromTemplateAction(
  projectId: string,
  templateId: string,
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const parsed = createPageSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { organization } = await getActiveOrganization()

  try {
    await createPageFromTemplate(organization.id, projectId, {
      ...parsed.data,
      templateId,
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Something went wrong',
    }
  }

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}

export async function deletePageAction(projectId: string, pageId: string) {
  const { organization } = await getActiveOrganization()
  await deletePage(organization.id, projectId, pageId)
  revalidatePath(`/projects/${projectId}`)
}
