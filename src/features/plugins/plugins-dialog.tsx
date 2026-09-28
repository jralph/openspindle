import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import { FolderOpen, Puzzle } from "lucide-react"
import { z } from "zod"
import { parseGitHubRepository } from "@openspindle/plugin-core"
import type { InstallReview } from "@openspindle/plugin-core"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AppDialog } from "@/features/shell/app-dialog"
import type { PrepareInstallResult } from "@/platform/contract/plugin-rpc"
import { useInstalledPlugins } from "@/platform/plugins"
import { InstallReviewDetails } from "./install-review"
import { InstalledPluginCard } from "./installed-plugin-card"
import {
  useConfirmInstall,
  useDiscardInstall,
  usePrepareInstall,
} from "./use-plugin-manager"

const RepositorySchema = z.object({
  repository: z
    .string()
    .trim()
    .min(1, "Enter a GitHub repository URL.")
    .superRefine((value, context) => {
      try {
        parseGitHubRepository(value)
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }),
})

/** Installs from a public GitHub repository, or from a folder during development. */
function InstallForm({
  onReview,
}: {
  onReview: (review: InstallReview) => void
}) {
  const prepare = usePrepareInstall()
  const review = (result: PrepareInstallResult) => {
    if (result.status === "review") onReview(result.review)
  }
  const form = useForm({
    defaultValues: { repository: "" },
    validators: { onSubmit: RepositorySchema },
    onSubmit: async ({ value, formApi }) => {
      // Failures show below the form (prepare.error).
      const result = await prepare
        .mutateAsync({ kind: "github", repository: value.repository.trim() })
        .catch(() => null)
      if (!result) return
      formApi.reset()
      review(result)
    },
  })
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="repository">
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor="plugin-repository">
              GitHub repository
            </FieldLabel>
            <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              <Input
                id="plugin-repository"
                type="url"
                placeholder="https://github.com/owner/repository"
                value={field.state.value}
                disabled={prepare.isPending}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <Button type="submit" disabled={prepare.isPending}>
                {prepare.isPending ? "Checking…" : "Install"}
              </Button>
            </div>
            <FieldDescription>
              Downloads the plugin at one commit and checks every file. You
              review what it may do before anything is installed.
            </FieldDescription>
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )}
      </form.Field>
      {prepare.error && (
        <Alert variant="destructive">
          <AlertDescription>{prepare.error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={prepare.isPending}
        onClick={() =>
          prepare.mutate({ kind: "folder" }, { onSuccess: review })
        }
      >
        <FolderOpen data-icon="inline-start" />
        Install from folder…
      </Button>
    </form>
  )
}

function InstalledPlugins({
  onReview,
}: {
  onReview: (review: InstallReview) => void
}) {
  const installed = useInstalledPlugins()
  if (installed.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{installed.error.message}</AlertDescription>
      </Alert>
    )
  if (!installed.data) return null
  if (!installed.data.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Puzzle />
          </EmptyMedia>
          <EmptyTitle>No plugins installed</EmptyTitle>
          <EmptyDescription>
            Plugins add programs, importers and editors to Add operation.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className="flex flex-col gap-3" aria-label="Installed plugins">
      {installed.data.map((plugin) => (
        <InstalledPluginCard
          key={plugin.id}
          plugin={plugin}
          onReview={onReview}
        />
      ))}
    </div>
  )
}

/** Confirms or cancels a staged install or update. */
function ReviewDialog({
  review,
  onDone,
  onClose,
}: {
  review: InstallReview
  onDone: () => void
  onClose: () => void
}) {
  const confirm = useConfirmInstall()
  const discard = useDiscardInstall()
  const updating = review.previous !== null
  const action = updating ? "Update" : "Install"
  return (
    <AppDialog
      title={`${action} ${review.plugin.name}?`}
      width="wide"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="outline"
            disabled={confirm.isPending}
            onClick={() => {
              discard.mutate(review.reviewId)
              onDone()
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate(review.reviewId, { onSuccess: onDone })
            }
          >
            {confirm.isPending ? "Installing…" : action}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <InstallReviewDetails review={review} />
        {confirm.error && (
          <Alert variant="destructive">
            <AlertDescription>{confirm.error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </AppDialog>
  )
}

/** The plugin manager: installed plugins, installing and updating with a review. */
export function PluginsDialog({ onClose }: { onClose: () => void }) {
  const [review, setReview] = useState<InstallReview | null>(null)
  const discard = useDiscardInstall()
  if (review)
    return (
      <ReviewDialog
        review={review}
        onDone={() => setReview(null)}
        onClose={() => {
          discard.mutate(review.reviewId)
          onClose()
        }}
      />
    )
  return (
    <AppDialog title="Plugins" width="wide" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <InstallForm onReview={setReview} />
        <InstalledPlugins onReview={setReview} />
      </div>
    </AppDialog>
  )
}
