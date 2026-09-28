import { useLocation, useNavigate } from "@tanstack/react-router"
import { Cpu, Layers3, Play } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SECTIONS = [
  { value: "prepare", label: "Prepare", icon: Layers3 },
  { value: "job", label: "Job", icon: Play },
  { value: "device", label: "Device", icon: Cpu },
] as const
type Section = (typeof SECTIONS)[number]["value"]

const isSection = (value: unknown): value is Section =>
  SECTIONS.some((section) => section.value === value)

/** The workspace sections as tabs over routes: the URL is the source of truth. */
export function WorkspaceTabs() {
  const section = useLocation({
    select: (location) => location.pathname.split("/")[1],
  })
  const navigate = useNavigate()
  return (
    <Tabs
      value={isSection(section) ? section : "prepare"}
      onValueChange={(value) => {
        if (isSection(value)) void navigate({ to: `/${value}` })
      }}
    >
      <TabsList variant="line" className="h-12" aria-label="Workspace">
        {SECTIONS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="px-4">
            <Icon />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
