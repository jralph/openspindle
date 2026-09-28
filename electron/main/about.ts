import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "electron"
import { log } from "./diagnostics/log.ts"
import { ThirdPartyNoticesSchema, creditsText } from "./third-party-notices.ts"

/** Production builds keep it in build/; packaged apps carry it among their resources. */
const noticesFile = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "third-party-notices.json")
    : fileURLToPath(
        new URL("../../build/third-party-notices.json", import.meta.url)
      )

async function credits(): Promise<string | undefined> {
  try {
    const notices = ThirdPartyNoticesSchema.parse(
      JSON.parse(await readFile(noticesFile(), "utf8"))
    )
    return creditsText(notices)
  } catch (error) {
    log.error("The About panel has no credits", error)
    return undefined
  }
}

/**
 * The About panel's version, build number and credits. Packaged apps show the version and
 * build number in their Info.plist (docs/releasing.md). Dev and preview runs start Electron's
 * own bundle, whose Info.plist has Electron's version, so they give package.json's, as a dev
 * build. The credits list the open-source software the app includes, with its licenses.
 */
export async function configureAboutPanel(): Promise<void> {
  const text = await credits()
  app.setAboutPanelOptions({
    ...(app.isPackaged
      ? {}
      : { applicationVersion: app.getVersion(), version: "dev" }),
    ...(text === undefined ? {} : { credits: text }),
  })
}
