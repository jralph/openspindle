import { hasFileExtension, suggestedFileName } from "@/platform/contract/files"
import { readTextFile } from "@/platform/read-text-file"

export const isProjectFileName = (name: string) =>
  hasFileExtension("project", name)
export type OpenedProjectFile = { fileName: string; contents: string }

export const suggestedProjectName = (name: string) =>
  suggestedFileName("project", name, "OpenSpindle project")

/**
 * Reads a project dropped onto the workspace; dialogs go through the host instead. Reads and
 * validates the file exactly as the host does when it opens one, so a project ⌘O refuses fails
 * the same way when it is dropped.
 */
export function readProjectFile(file: File): Promise<OpenedProjectFile> {
  return readTextFile("project", file)
}
