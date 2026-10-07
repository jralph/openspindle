# Probe inspection

The Job tab's **Inspection report** collects the existing probing operations into a read-only dimensional report. It covers stock or boss spans and location, pocket or bore spans and center distances, and surface mapping. It uses the plate, probe tools and device identity frozen when Run was pressed. Editing the workspace or changing the connection afterwards does not relabel the report. The controller prototype accepts only simulator connections; physical metrology and calibration are unverified.

## Three experiments

Create a separate plate containing only the probing operations for the experiment. In **Prepare → Probing**, choose the existing strategy and configure its start, travel distances and probe as usual. Preview the whole program in Job, then use **Run** there. The report appears above the run stages. Export it before Dismiss or starting another job: it is a view of the current Run, not a saved inspection history.

| Experiment                 | Operation                                                                                                | Report                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Rectangular stock or boss  | **Boss center**, X and Y, with the start over its top and distances beyond its sides                     | Machine center X/Y, top Z, ball-compensated X/Y spans and the opposed sides sampled along each axis |
| Hole or pocket             | **Pocket center**, X and Y, starting inside at the wall-contact height                                   | Machine center X/Y and ball-compensated X/Y wall spans                                              |
| Distances between features | Two or more center operations on the same plate, with separately positioned starts                       | Choose **Distance from center** and **To center**; report ΔX, ΔY and XY center distance             |
| Surface mapping            | **Height map**, with an anchored placement and work origin configured for the firmware's reporting cycle | Grid, relative heights, height range, outliers, tilt and sampled flatness                           |

The built-in corner strategies report a corner and top, but do not measure width and length. A one-axis center operation reports that axis only and cannot be used for XY center distances. For multiple features, use stored-anchor placements: the first center routine changes the work origin, so a later start must not depend on the work origin it replaced. Pocket starts need the correct wall-contact Z. Check the generated descents in the preview.

These are the existing setup cycles, including their effects: **origin routines change the active work origin**, and **height grids enable height compensation**. Reading and exporting the report commands no motion and changes no settings. This phase does not add origin-preserving inspection cycles or a search for arbitrary unknown geometry. A grid written as a bare G32 in a played program may report no measurements; the anchored firmware cycle is the existing route that reports its grid ([probing](probing.md), [height maps](height-map.md)).

The simulator's origin routines use synthetic pocket/boss geometry, and its grid uses synthetic surface heights. These exercise report processing; they do not measure the dimensions of the stock drawn in the preview.

## Probes and interpretation

Joseph owns Makera's wired 3D touch probe, conductive 3D probe rod, and Z probe. The library's wired 3D probe is the first choice for the XY experiments. A custom library probe must have a known XYZ profile and correct effective tip diameter to use the origin strategies. Do not copy the wired probe's ball diameter onto another probe without checking it. The conductive rod depends on conductive material; the Z probe supports the existing surface workflow. Makera describes the three probe uses in its [Z1 quick start](https://wiki.makera.com/en/Z1/QuickStart).

The report reuses the existing routine's contact interpretation: each surface is touched twice and the second contact counts. A pocket's wall span is the separation of opposing ball-center contacts plus one ball diameter; a boss's span subtracts it. A valid feature needs the exact expected contact count, a finished operation, finite coordinates, a positive ball diameter and positive measured spans. Incomplete or extra contact sequences expose a problem rather than final dimensions. Raw contacts remain in exports.

Opposed slow contacts must run strictly from minus to plus along each probed axis before ball compensation. Grids also need positive finite extents matching the frozen settings, distinct evenly spaced coordinate offsets in the reported order, and consistent sample dimensions. The run-stage association skips routes that cannot report measurements. When multiple reporting routines exist but their measurement count is incomplete or unexpected, the report withholds operation attribution and center comparisons, and exports the raw data as unassigned. Missing measurements are listed explicitly. Once the complete ordered sequence arrives, the operations can be reported by that sequence.

The **Second touch correction** is the largest displacement between a fast and slow contact pair. It is not calibrated probe repeatability. Spans are sampled along the machine axes: they do not establish stock rotation, squareness, circularity, a best-fit circle diameter or the full boundary of an irregular pocket. Center distances are from the same Run and machine coordinate frame, and are independent of changes to work zero between routines.

Surface heights are relative to the grid's first sample, never absolute machine Z. **Sampled flatness · all points** is the peak-to-valley residual about a least-squares plane using every measured point. The existing review's flatness and tilt excluding flagged outliers are shown separately; outliers, missing samples, a mismatched grid or a failed operation prevent a complete result. This is a sampled estimate, not a minimum-zone flatness measurement or a calibration certificate; features between grid points remain unmeasured. No dimensional pass/fail tolerance is inferred from the stock model.

## Exports

**Export JSON** saves the versioned report, frozen device/source identity, Run identity and timestamps, operation parameters, probe identity and diameter, raw contacts, raw grids, status and analysis, and the selected center comparison. **Export CSV** saves a long table with status, source, frame and unit attached to each value, plus contact coordinates and grid heights/offsets. User labels are quoted and protected from spreadsheet formula evaluation. Simulator reports are marked **Simulated measurements**, and both formats record calibration as unverified. Exports use the native Save dialog and have no machine-command content.

JSON and CSV use separate file kinds, so the Save dialog preserves the selected format's extension even after renaming the file.

## Verification

The repository forbids automated tests without an explicit user request. Type checking, lint, formatting and the production build validate this implementation; the fresh report still needs a hands-on application trial. Physical probe accuracy, effective diameter, stylus alignment, repeatability and stopping distances are not established by simulator results.

For the simulator trial, run each experiment above and check the report's source badge. Use two separately placed center operations to check ΔX/ΔY, export both formats, and confirm the operation names and raw data. Stop an origin operation before all contacts and a grid before completion: their report must be incomplete and must not offer the stopped center as a distance reference. Compare the report against its run-stage measurements and 3D preview. Do not dismiss until the exports are saved.

One independent read-only review identified four corrections: reporting-route association, ordered wall contacts, format-specific file extensions and grid geometry validation. All four were addressed in this change. The review did not judge hands-on UI behavior, native Save dialogs, simulator lifecycle timing, physical calibration/accuracy, or synthetic geometry matching the stock; these remain manual verification limits, with synthetic geometry explicitly documented above.
