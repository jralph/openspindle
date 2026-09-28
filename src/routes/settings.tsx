import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppearance } from "@/components/appearance-provider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { OptionSelect } from "@/components/option-select"
import { DiagnosticsSettingsCard } from "@/features/settings/diagnostics-settings"
import { isAppearance } from "@/lib/appearance"

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — OpenSpindle" }] }),
  component: Settings,
})

const appearanceOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

function Settings() {
  const { appearance, setAppearance, saveError } = useAppearance()

  return (
    <>
      {/* Drags the desktop window from under its transparent title bar. */}
      <div className="h-[env(titlebar-area-height,0px)] [app-region:drag]" />
      <main
        aria-label="Settings"
        className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6"
      >
        <Button
          variant="ghost"
          className="self-start"
          render={<Link to="/prepare" />}
        >
          <ArrowLeft />
          Back to the workspace
        </Button>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              Appearance
            </CardTitle>
            <CardDescription>Choose how OpenSpindle looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="appearance">Color mode</FieldLabel>
                <OptionSelect
                  id="appearance"
                  aria-describedby="appearance-description"
                  className="w-full"
                  options={appearanceOptions}
                  value={appearance}
                  onValueChange={(value) => {
                    if (isAppearance(value)) setAppearance(value)
                  }}
                />
                <FieldDescription id="appearance-description">
                  System follows your device’s light or dark appearance. Changes
                  apply immediately.
                </FieldDescription>
                {saveError && <FieldError>{saveError}</FieldError>}
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <DiagnosticsSettingsCard />
      </main>
    </>
  )
}
